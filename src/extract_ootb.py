#!/usr/bin/env python3
"""Extract the Collibra out-of-the-box operating model from the doc snapshots
in sources/raw/ into an RDF graph (JSON-LD) using the colibri: vocabulary.

Every node carries its origin URL (dcterms:source) and snapshot file
(colibri:snapshot) so any transcription can be audited against the source row.

Doc quirks handled here:
- nbsp (&#160;) inside names is a space, never a value separator; values are
  comma-separated.
- the asset type column 2 is an ancestry breadcrumb ending in the type itself.
- the attribute table's column 3 is "assigned asset types" for most rows but
  "possible values" for selection-style rows (e.g. Rule Status); the two are
  distinguished structurally: known asset type names (case-insensitive) and
  multi-word title-case names are asset references, everything else is a
  possible value.
- some referenced asset types have no row in any table (AI Model, Role Type,
  Databricks Schema, ...); they are minted with explicit provenance instead of
  being silently dropped.

Provenance values:
  collibra-ootb            row in an OOTB reference table
  collibra-ootb-breadcrumb  asset type appearing only inside an ancestry breadcrumb
  collibra-ootb-ref         asset type referenced by another OOTB table, with no row
  mock                     synthetic node not present in the documentation

Output: tmp/ootb-metamodel.ttl (Turtle, so Phase 2 can merge metaphactory's
own Turtle exports straight into the same graph)
"""

import html
import re
from pathlib import Path

from rdflib import Graph, Literal, Namespace, RDF, URIRef

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "sources" / "raw"
OUT = ROOT / "tmp" / "ootb-metamodel.ttl"

VOCAB_NS = "https://colibri.example/ns/colibri#"
DATA_NS = "https://colibri.example/data/ootb/"

COL = Namespace(VOCAB_NS)
RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")
SKOS = Namespace("http://www.w3.org/2004/02/skos/core#")
DCT = Namespace("http://purl.org/dc/terms/")

ORIGINS = {
    "asset": "https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/AssetTypes/ref_ootb-asset-types.htm",
    "attribute": "https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/Characteristics/Attributes/AttributeTypes/ref_attribute-types.htm",
    "relation": "https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/Characteristics/Relations/RelationTypes/ref_relation-types.htm",
}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def table_rows(path: Path):
    src = path.read_text(encoding="utf-8", errors="replace")
    tables = re.findall(r"<table[^>]*>.*?</table>", src, re.S | re.I)
    if len(tables) != 1:
        raise SystemExit(f"{path.name}: expected 1 table, found {len(tables)}")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tables[0], re.S | re.I)
    out = []
    for row in rows:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)
        out.append([html.unescape(clean(c)) for c in cells])
    return out


def split_multi(cell: str):
    """Values in a doc cell are comma-separated; nbsp is a space inside a name;
    parenthetical footnotes are dropped; '-' is a placeholder."""
    cell = re.sub(r"\s*\(For more information[^)]*\)", "", cell, flags=re.I)
    parts = [p.replace("\xa0", " ").strip() for p in cell.split(",")]
    return [p for p in parts if p and p != "-"]


def norm(text: str) -> str:
    """Strip tags, then unescape entities, then collapse whitespace (incl. nbsp)."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def parse_asset_table(path: Path):
    """The asset type table's second column is not plain text: it is
    <div class="parentNode">Parent1 &#160;<img arrow/> Parent2 &#160;<img arrow/> ...</div>
    followed by the type's own name. Parents must be recovered by splitting on
    the arrow images — the nbsp entities inside the div are part of names."""
    src = path.read_text(encoding="utf-8", errors="replace")
    tables = re.findall(r"<table[^>]*>.*?</table>", src, re.S | re.I)
    if len(tables) != 1:
        raise SystemExit(f"{path.name}: expected 1 table, found {len(tables)}")
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", tables[0], re.S | re.I):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)
        if len(cells) != 4:
            continue
        name, breadcrumb, desc, products = (norm(c) for c in cells)
        chain = []
        m = re.search(r'<div[^>]*class="parentNode"[^>]*>(.*?)</div>', cells[1], re.S | re.I)
        if m:
            inner = m.group(1)
            for part in re.split(r"<img[^>]*>", inner, flags=re.I):
                seg = norm(part)
                if seg:
                    chain.append(seg)
            # a trailing segment equal to the row name is the type itself
            if chain and chain[-1].casefold() == name.casefold():
                chain.pop()
        else:
            seg = norm(cells[1])
            if seg and seg.casefold() != name.casefold():
                chain = [seg]
        out.append((name, chain, desc, products))
    return out


def looks_like_asset_type(name: str) -> bool:
    words = name.split()
    return len(words) >= 2 and all(w[0].isupper() for w in words)


def main():
    nodes = []
    asset_iri = {}        # exact name -> IRI
    asset_iri_ci = {}     # casefolded name -> IRI
    used_slugs = {}       # slug -> IRI (collision guard)

    def add_asset(name, *, provenance, desc="", parent=None, product=None):
        if name in asset_iri:
            return asset_iri[name]
        ci = name.casefold()
        if ci in asset_iri_ci:
            return asset_iri_ci[ci]
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed"
        iri = DATA_NS + "assetType/" + slug
        n = 2
        while iri in used_slugs.values():
            iri = DATA_NS + "assetType/" + slug + f"-{n}"
            n += 1
        asset_iri[name] = iri
        asset_iri_ci[ci] = iri
        used_slugs[slug] = iri
        node = {
            "@id": iri,
            "@type": "colibri:AssetType",
            "skos:prefLabel": name,
            "rdfs:comment": desc,
            "colibri:provenance": provenance,
            "dcterms:source": {"@id": ORIGINS["asset"]},
            "colibri:snapshot": "sources/raw/asset-types-ootb.htm",
        }
        if product:
            node["colibri:product"] = product
        if parent:
            if parent in asset_iri:
                node["rdfs:subClassOf"] = {"@id": asset_iri[parent]}
            else:
                node["_pendingParent"] = parent
        nodes.append(node)
        return iri

    def resolve_asset(name, *, reason):
        """Reference by name; mint a provenance-marked phantom when unknown."""
        if name in asset_iri:
            return asset_iri[name]
        ci = name.casefold()
        if ci in asset_iri_ci:
            return asset_iri_ci[ci]
        desc = ("Asset type referenced by another OOTB table "
                f"({reason}); has no row in the asset type reference table.")
        return add_asset(name, provenance="collibra-ootb-ref", desc=desc)

    # ---- asset types: name | ancestry chain | description | products ----
    chains = []
    for name, chain, desc, products in parse_asset_table(RAW / "asset-types-ootb.htm"):
        if name in ("", "Asset type"):
            continue
        parent = chain[-1] if chain else None
        add_asset(name, provenance="collibra-ootb", desc=desc, parent=parent, product=products)
        chains.append(chain + [name])

    # asset types appearing only as intermediate ancestry segments
    for chain in chains:
        for i, seg in enumerate(chain[:-1]):
            if seg not in asset_iri:
                add_asset(seg, provenance="collibra-ootb-breadcrumb",
                          desc="Asset type referenced in the OOTB ancestry chain; has no row of its own in the reference table.",
                          parent=chain[i - 1] if i > 0 else None)

    # synthetic common root so the z-axis has a single base stratum;
    # also resolves the generic "Asset" endpoint used by relation types.
    # Created before the other tables are processed so their "Asset"
    # references resolve to this node instead of minting a phantom.
    root_iri = add_asset("Asset", provenance="mock",
                         desc="The common root of all Collibra asset types (synthetic node, not in the OOTB table).")

    # ---- attribute types: name | description | assigned or values | kind ----
    attr_ref_names = set()
    rows = [r for r in table_rows(RAW / "attribute-types-ootb.htm")[1:] if r[0] != "Attribute type"]
    attr_names = set()
    for name, desc, col3, kind in rows:
        if name in attr_names:
            raise SystemExit(f"duplicate attribute type name: {name}")
        attr_names.add(name)
        node = {
            "@id": DATA_NS + "attributeType/" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
            "@type": "colibri:AttributeType",
            "skos:prefLabel": name,
            "rdfs:comment": desc,
            "colibri:provenance": "collibra-ootb",
            "dcterms:source": {"@id": ORIGINS["attribute"]},
            "colibri:snapshot": "sources/raw/attribute-types-ootb.htm",
            "colibri:kind": kind.replace("\xa0", " ").strip(),
        }
        refs, values = [], []
        raw_col3 = col3.replace("\xa0", " ").strip()
        if raw_col3 in ("-", "All"):
            # unrestricted: available on every asset type; one edge to the
            # synthetic root carries that meaning without 218 links per node
            node["colibri:unrestricted"] = True
            node["colibri:assignedTo"] = [{"@id": asset_iri["Asset"]}]
        else:
            for item in split_multi(col3):
                ci = item.casefold()
                if item in asset_iri or ci in asset_iri_ci or looks_like_asset_type(item):
                    iri = resolve_asset(item, reason="attribute assignment")
                    attr_ref_names.add(item)
                    refs.append({"@id": iri})
                else:
                    values.append(item)
            if refs:
                node["colibri:assignedTo"] = refs
            else:
                node["colibri:unassigned"] = True
                node["colibri:assignedTo"] = [{"@id": asset_iri["Asset"]}]
            if values:
                node["colibri:possibleValue"] = values
        nodes.append(node)

    # ---- relation types: head | role | co-role | tail ----
    rel_ids = set()
    rows = [r for r in table_rows(RAW / "relation-types-ootb.htm")[1:] if r[0] != "Head"]
    for head, role, co_role, tail in rows:
        iri = DATA_NS + "relationType/" + re.sub(r"[^a-z0-9]+", "-", f"{head}-{role}-{tail}".lower()).strip("-")
        if iri in rel_ids:
            continue
        rel_ids.add(iri)
        node = {
            "@id": iri,
            "@type": "colibri:RelationType",
            "skos:prefLabel": role.replace("\xa0", " ").strip(),
            "rdfs:comment": f"Explicit relation type: {head} — {role} / {co_role} → {tail}".replace("\xa0", " "),
            "colibri:provenance": "collibra-ootb",
            "dcterms:source": {"@id": ORIGINS["relation"]},
            "colibri:snapshot": "sources/raw/relation-types-ootb.htm",
            "colibri:coRole": co_role.replace("\xa0", " ").strip(),
        }
        heads = [{"@id": resolve_asset(h, reason="relation endpoint")} for h in split_multi(head)]
        tails = [{"@id": resolve_asset(t, reason="relation endpoint")} for t in split_multi(tail)]
        if heads:
            node["colibri:head"] = heads
        if tails:
            node["colibri:tail"] = tails
        nodes.append(node)

    # resolve deferred parents (children appearing before their parent's row)
    for node in nodes:
        if "_pendingParent" not in node:
            continue
        parent = node.pop("_pendingParent")
        node["rdfs:subClassOf"] = {"@id": resolve_asset(parent, reason="asset type hierarchy")}

    # attach every parentless asset type (except the root) to the synthetic root
    for node in nodes:
        if node["@type"] == "colibri:AssetType" and node["@id"] != root_iri and "rdfs:subClassOf" not in node:
            node["rdfs:subClassOf"] = {"@id": root_iri}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    g = Graph()
    g.bind("colibri", COL)
    g.bind("rdfs", RDFS)
    g.bind("skos", SKOS)
    g.bind("dcterms", DCT)
    g.bind("asset", Namespace(DATA_NS + "assetType/"))
    g.bind("attribute", Namespace(DATA_NS + "attributeType/"))
    g.bind("relation", Namespace(DATA_NS + "relationType/"))

    type_map = {
        "colibri:AssetType": COL.AssetType,
        "colibri:AttributeType": COL.AttributeType,
        "colibri:RelationType": COL.RelationType,
    }
    prop_map = {
        "skos:prefLabel": SKOS.prefLabel,
        "rdfs:comment": RDFS.comment,
        "rdfs:subClassOf": RDFS.subClassOf,
        "colibri:provenance": COL.provenance,
        "colibri:snapshot": COL.snapshot,
        "colibri:product": COL.product,
        "colibri:kind": COL.kind,
        "colibri:coRole": COL.coRole,
        "colibri:head": COL.head,
        "colibri:tail": COL.tail,
        "colibri:assignedTo": COL.assignedTo,
        "colibri:possibleValue": COL.possibleValue,
        "colibri:unrestricted": COL.unrestricted,
        "colibri:unassigned": COL.unassigned,
        "dcterms:source": DCT.source,
    }
    for n in nodes:
        s = URIRef(n["@id"])
        g.add((s, RDF.type, type_map[n["@type"]]))
        for k, v in n.items():
            if k in ("@id", "@type"):
                continue
            p = prop_map[k]
            for val in (v if isinstance(v, list) else [v]):
                if isinstance(val, dict):
                    g.add((s, p, URIRef(val["@id"])))
                elif isinstance(val, bool):
                    g.add((s, p, Literal(val)))
                else:
                    g.add((s, p, Literal(val)))
    g.serialize(destination=str(OUT), format="turtle")

    counts, prov, values = {}, {}, []
    for n in nodes:
        t = n["@type"].split(":")[-1]
        counts[t] = counts.get(t, 0) + 1
        p = n.get("colibri:provenance", "?")
        prov[p] = prov.get(p, 0) + 1
        if n["@type"] == "colibri:AttributeType" and n.get("colibri:possibleValue"):
            values.append(n["skos:prefLabel"])
    print(f"nodes written: {len(nodes)} -> {OUT.relative_to(ROOT)}")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")
    for k, v in sorted(prov.items()):
        print(f"  provenance {k}: {v}")
    print(f"  attributes with possible values: {values}")


if __name__ == "__main__":
    main()
