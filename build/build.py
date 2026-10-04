#!/usr/bin/env python3
"""Build the pyntology visualization payload from the RDF graph.

Loads the Python ontology vocabulary and every ontology file dropped
into data/ontologies/ (.ttl, .owl, .rdf, .nt, .n3, .jsonld). Generic
OWL/SKOS mapping:

  owl:Ontology / owl:Class / owl:ObjectProperty / owl:DatatypeProperty /
  owl:AnnotationProperty / skos:ConceptScheme / skos:Concept  -> nodes
  rdfs:subClassOf, rdfs:subPropertyOf, skos:broader, owl:imports -> hierarchy
  skos:inScheme, colibri:assignedTo, colibri:head, colibri:tail    -> links

Provenance of nodes from dropped files is the file stem. owl:imports targets
that were not loaded are minted as phantom ontology nodes (provenance
external-import) so the import structure stays visible.

Output: web/graph.json
  { "nodes": [...], "links": [...] }

Run with the project venv: .venv/bin/python build/build.py
"""

import argparse
import json
import sys
from pathlib import Path

from rdflib import Graph, Literal, Namespace, RDF, URIRef

ROOT = Path(__file__).resolve().parent.parent
ONTO_DIR = ROOT / "data" / "ontologies"
OUT = ROOT / "web" / "graph.json"

COL = Namespace("https://colibri.example/ns/colibri#")
PY = Namespace("https://colibri.example/ns/py#")
SH = Namespace("http://www.w3.org/ns/shacl#")
RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")
OWL = Namespace("http://www.w3.org/2002/07/owl#")
SKOS = Namespace("http://www.w3.org/2004/02/skos/core#")

FORMATS = {".ttl": "turtle", ".owl": "xml", ".rdf": "xml", ".nt": "nt",
           ".n3": "n3", ".jsonld": "json-ld", ".json": "json-ld"}

# kinds merged to a friendlier name in the output
KIND_ALIAS = {
    "ObjectProperty": "Property",
    "DatatypeProperty": "Property",
    "AnnotationProperty": "Property",
    "ConceptScheme": "Vocabulary",
    "Type": "Class",  # a Python type IS a class
    "NodeShape": "Shape",
    "PropertyShape": "Shape",
}
# dedupe priority when a node carries several types (lower wins)
KIND_RANK = {
    "AssetType": 0, "AttributeType": 0, "RelationType": 0,
    "Exception": 0, "Value": 0, "Callable": 0, "Shape": 0,
    "Violation": 0, "Variable": 0,
    "Ontology": 1, "Metatype": 2, "Vocabulary": 2,
    "Class": 3, "Property": 4, "Concept": 5,
}
HIER_LINKS = ("subclass", "subProperty", "broader", "imports",
              "storedIn", "hostedIn",
              "instanceOf", "metaclassOf", "mroNext")

GENERIC_TYPES = ", ".join(f"<{t}>" for t in
                          (OWL.Ontology, OWL.Class, OWL.ObjectProperty,
                           OWL.DatatypeProperty, OWL.AnnotationProperty,
                           SKOS.ConceptScheme, SKOS.Concept,
                           SH.NodeShape, SH.PropertyShape,
                           PY.Type, PY.Metatype, PY.Exception,
                           PY.Value, PY.Callable, PY.Module, PY.Protocol))

NODE_QUERY = f"""
PREFIX colibri: <{COL}>
PREFIX py: <{PY}>

SELECT ?id ?type ?prov ?product ?attrKind ?coRole ?unres ?unass ?tlevel WHERE {{
  ?id a ?type .
  FILTER(?type IN (
    colibri:AssetType, colibri:AttributeType, colibri:RelationType,
    {GENERIC_TYPES}
  ))
  FILTER(!isBlank(?id))
  FILTER(!STRSTARTS(STR(?id), STR(colibri:)))
  OPTIONAL {{ ?id colibri:provenance ?prov }}
  OPTIONAL {{ ?id colibri:product ?product }}
  OPTIONAL {{ ?id colibri:kind ?attrKind }}
  OPTIONAL {{ ?id colibri:coRole ?coRole }}
  OPTIONAL {{ ?id colibri:unrestricted ?unres }}
  OPTIONAL {{ ?id colibri:unassigned ?unass }}
  OPTIONAL {{ ?id py:towerLevel ?tlevel }}
}}
"""

# multilingual labels and descriptions, collected per node so that no language
# variant is dropped; the panel shows them all
LABELS_QUERY = f"""
PREFIX rdfs: <{RDFS}>
PREFIX skos: <{SKOS}>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT ?id ?prio ?lit WHERE {{
  {{ ?id skos:prefLabel ?lit . BIND(0 AS ?prio) }}
  UNION {{ ?id rdfs:label ?lit . BIND(1 AS ?prio) }}
  UNION {{ ?id dcterms:title ?lit . BIND(2 AS ?prio) }}
  FILTER(isLiteral(?lit))
}}
"""

DESCS_QUERY = f"""
PREFIX rdfs: <{RDFS}>
PREFIX skos: <{SKOS}>

SELECT ?id ?prio ?lit WHERE {{
  {{ ?id rdfs:comment ?lit . BIND(0 AS ?prio) }}
  UNION {{ ?id skos:definition ?lit . BIND(1 AS ?prio) }}
  FILTER(isLiteral(?lit))
}}
"""

# kind minted for a referenced-but-unloaded entity, by the link type
# through which it is referenced
GHOST_KIND = {
    "subclass": "Class", "subProperty": "Property", "broader": "Concept",
    "inScheme": "Vocabulary", "domain": "Class", "range": "Class",
    "imports": "Ontology", "instanceOf": "Metatype",
    "metaclassOf": "Metatype", "mroNext": "Class",
    "calls": "Callable", "definedIn": "Module",
    "raises": "Exception", "raisesWhen": "Concept",
    "precondition": "Concept", "implementsProtocol": "Protocol",
    "callCategory": "Concept",
    "targets": "Class", "property": "Shape", "path": "Property",
    "hasValue": "Class", "classConstraint": "Class",
    "violationOf": "Shape", "violationAt": "Class",
}

PV_QUERY = f"""
PREFIX colibri: <{COL}>
SELECT ?id ?pval WHERE {{ ?id colibri:possibleValue ?pval }}
"""

LINK_QUERY = f"""
PREFIX colibri: <{COL}>
PREFIX rdfs: <{RDFS}>
PREFIX owl: <{OWL}>
PREFIX skos: <{SKOS}>
PREFIX py: <{PY}>

SELECT ?source ?target ?type WHERE {{
  {{ ?source rdfs:subClassOf ?target . BIND("subclass" AS ?type) }}
  UNION
  {{ ?source rdfs:subPropertyOf ?target . BIND("subProperty" AS ?type) }}
  UNION
  {{ ?source skos:broader ?target . BIND("broader" AS ?type) }}
  UNION
  {{ ?source owl:imports ?target . BIND("imports" AS ?type) }}
  UNION
  {{ ?source skos:inScheme ?target . BIND("inScheme" AS ?type) }}
  UNION
  {{ ?source py:instanceOf ?target . BIND("instanceOf" AS ?type) }}
  UNION
  {{ ?source py:metaclassOf ?target . BIND("metaclassOf" AS ?type) }}
  UNION
  {{ ?source py:mroNext ?target . BIND("mroNext" AS ?type) }}
  UNION
  {{ ?source py:calls ?target . BIND("calls" AS ?type) }}
  UNION
  {{ ?source py:definedIn ?target . BIND("definedIn" AS ?type) }}
  UNION
  {{ ?source py:raises ?target . BIND("raises" AS ?type) }}
  UNION
  {{ ?source py:raisesWhen ?target . BIND("raisesWhen" AS ?type) }}
  UNION
  {{ ?source py:precondition ?target . BIND("precondition" AS ?type) }}
  UNION
  {{ ?source py:implementsProtocol ?target . BIND("implementsProtocol" AS ?type) }}
  UNION
  {{ ?source py:callCategory ?target . BIND("callCategory" AS ?type) }}
  UNION
  {{ ?source sh:targetClass ?target . BIND("targets" AS ?type) }}
  UNION
  {{ ?source sh:targetNode ?target . BIND("targets" AS ?type) }}
  UNION
  {{ ?source sh:property ?target . BIND("property" AS ?type) }}
  UNION
  {{ ?source sh:path ?target . BIND("path" AS ?type) }}
  UNION
  {{ ?source sh:hasValue ?target . BIND("hasValue" AS ?type) }}
  UNION
  {{ ?source sh:class ?target . BIND("classConstraint" AS ?type) }}
  UNION
  {{ ?source rdfs:domain ?target . BIND("domain" AS ?type) FILTER(!STRSTARTS(STR(?source), STR(colibri:))) }}
  UNION
  {{ ?source rdfs:range ?target . BIND("range" AS ?type) FILTER(!STRSTARTS(STR(?source), STR(colibri:))) }}
  UNION
  {{ ?source owl:inverseOf ?target . BIND("inverseOf" AS ?type) }}
  UNION
  {{ ?source colibri:assignedTo ?target . BIND("assignedTo" AS ?type) }}
  UNION
  {{ ?source colibri:head ?target . BIND("head" AS ?type) }}
  UNION
  {{ ?source colibri:tail ?target . BIND("tail" AS ?type) }}
  FILTER(!isBlank(?source) && !isBlank(?target))
}}
"""

PROV_STAMP_QUERY = f"""
PREFIX colibri: <{COL}>
PREFIX owl: <{OWL}>
PREFIX skos: <{SKOS}>

SELECT DISTINCT ?s WHERE {{
  ?s a ?t .
  FILTER(?t IN ({GENERIC_TYPES}))
  FILTER(!isBlank(?s))
  FILTER(!STRSTARTS(STR(?s), STR(colibri:)))
}}
"""


def iri_tail(iri: str) -> str:
    for sep in ("#", "/"):
        if sep in iri:
            return iri.rsplit(sep, 1)[-1] or iri
    return iri


def smart_iri_tail(iri: str) -> str:
    """IRI tail with trailing version-like segments stripped, so an ontology
    IRI ending in /0.1 is named by its meaningful segment."""
    import re
    segs = [s for s in re.split(r"[#/]", iri) if s]
    while segs and re.fullmatch(r"v?\d[\w.-]*", segs[-1]):
        segs.pop()
    return segs[-1] if segs else iri


def load_ontologies(g: Graph):
    """Load every ontology file from data/ontologies/ into the graph,
    stamping provenance (file stem) onto its typed nodes, first file wins.
    Also returns a mapping of every stamped node to the owl:Ontology
    declarations in its file, so the build can add definedBy links."""
    loaded = []
    defined_by = {}
    file_ontos = []  # (file stem, [ontology IRIs declared in that file])
    if not ONTO_DIR.exists():
        return loaded, defined_by, file_ontos
    for f in sorted(ONTO_DIR.iterdir()):
        if f.suffix.lower() not in FORMATS or f.name.startswith("."):
            continue
        gf = Graph()
        gf.parse(str(f), format=FORMATS[f.suffix.lower()])
        onto_iris = [str(s) for s in gf.subjects(RDF.type, OWL.Ontology)]
        g += gf
        stamped = []
        for row in gf.query(PROV_STAMP_QUERY):
            s = URIRef(str(row.s))
            if not list(g.objects(s, COL.provenance)):
                g.add((s, COL.provenance, Literal(f.stem)))
                stamped.append(str(s))
        if onto_iris:
            for n in stamped:
                defined_by.setdefault(n, []).extend(
                    o for o in onto_iris if o != n)
        if onto_iris:
            file_ontos.append((f.stem, onto_iris))
        loaded.append((f.name, len(gf), len(stamped)))
    return loaded, defined_by, file_ontos


def run_shacl(g: Graph):
    """Validate the loaded graph against any SHACL shapes it contains.
    Returns a list of (focus node IRI, source shape IRI, message).
    Validation is the __instancecheck__: a violation is an exception event
    raised by the shape against a focus node."""
    try:
        from pyshacl import validate
    except ImportError:
        print("pyshacl not installed - skipping SHACL validation")
        return []
    conforms, rgraph, _ = validate(g, inference="none", debug=False)
    out = []
    for r in rgraph.subjects(RDF.type, SH.ValidationResult):
        focus = next(rgraph.objects(r, SH.focusNode), None)
        source = next(rgraph.objects(r, SH.sourceShape), None)
        msg = next(rgraph.objects(r, SH.resultMessage), None)
        if focus is not None and source is not None:
            out.append((str(focus), str(source), str(msg) if msg else ""))
    print(f"SHACL validation: "
          f"{'conforms' if conforms else f'{len(out)} violation(s) found'}")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    args = ap.parse_args()

    g = Graph()
    vocab_ontos = []  # (file stem, [ontology IRIs declared in the file])
    for vf in sorted((ROOT / "vocabulary").glob("*.ttl")):
        vg = Graph()
        vg.parse(str(vf), format="turtle")
        ontos = [str(s) for s in vg.subjects(RDF.type, OWL.Ontology)]
        if ontos:
            vocab_ontos.append((vf.stem, ontos))
        g += vg
    loaded, defined_by, file_ontos = load_ontologies(g)
    violations = run_shacl(g)
    print("mode: ontologies only")

    pvals = {}
    for row in g.query(PV_QUERY):
        pvals.setdefault(str(row.id), []).append(str(row.pval))

    def pick_lang_literal(lits):
        """Deterministic pick: English, then unlanguaged, then alphabetical.
        lits: list of rdflib Literals."""
        if not lits:
            return None
        for lit in lits:
            if lit.language == "en":
                return lit
        for lit in lits:
            if not lit.language:
                return lit
        return sorted(lits, key=lambda l: str(l.language))[0]

    labels_map = {}   # id -> {prio: [Literal, ...]}
    for row in g.query(LABELS_QUERY):
        labels_map.setdefault(str(row.id), {}).setdefault(int(row.prio), []).append(row.lit)
    descs_map = {}
    for row in g.query(DESCS_QUERY):
        descs_map.setdefault(str(row.id), {}).setdefault(int(row.prio), []).append(row.lit)

    def best_label(id_):
        for prio in sorted(labels_map.get(id_, {})):
            lit = pick_lang_literal(labels_map[id_][prio])
            if lit is not None:
                return lit
        return None

    def all_labels(id_):
        """Every label variant as {lang: text}, for the panel."""
        out = {}
        for prio in sorted(labels_map.get(id_, {})):
            for lit in labels_map[id_][prio]:
                lang = lit.language or ""
                if lang not in out or (lit.language == "en"):
                    out[lang] = str(lit)
        return out

    def best_desc(id_):
        for prio in sorted(descs_map.get(id_, {})):
            lit = pick_lang_literal(descs_map[id_][prio])
            if lit is not None:
                return lit
        return None

    node_by_id = {}

    def rank(kind):
        return KIND_RANK.get(kind, 9)

    for row in g.query(NODE_QUERY):
        id_ = str(row.id)
        kind_raw = str(row.type).rsplit("#", 1)[-1].rsplit("/", 1)[-1]
        kind = KIND_ALIAS.get(kind_raw, kind_raw)
        if id_ in node_by_id and rank(node_by_id[id_]["kind"]) <= rank(kind):
            continue
        label = best_label(id_)
        name = str(label) if label is not None else (
            (smart_iri_tail if kind == "Ontology" else iri_tail)(id_))
        desc_lit = best_desc(id_)
        node_by_id[id_] = {
            "id": id_,
            "kind": kind,
            "name": name,
            "labels": all_labels(id_),
            "provenance": str(row.prov) if row.prov else "",
            "description": str(desc_lit) if desc_lit is not None else "",
            "product": str(row.product) if row.product else "",
            "attrKind": str(row.attrKind) if row.attrKind else "",
            "coRole": str(row.coRole) if row.coRole else "",
            "possibleValues": pvals.get(id_, []),
            "unrestricted": bool(row.unres),
            "unassigned": bool(row.unass),
            "towerLevel": int(row.tlevel) if row.tlevel is not None else None,
            "val": 0,
        }

    # build links; referenced-but-unloaded endpoints become ghost nodes
    links, dropped = [], 0
    missing = {}  # missing IRI -> list of (link type, direction, other IRI)
    pending_imports = []
    for row in g.query(LINK_QUERY):
        s, t = str(row.source), str(row.target)
        ltype = str(row.type)
        if ltype == "imports":
            pending_imports.append((s, t))
            continue
        if s in node_by_id and t in node_by_id:
            links.append({"source": s, "target": t, "type": ltype})
            continue
        dropped += 1
        for end, direction in ((s, "from"), (t, "to")):
            if end not in node_by_id:
                other = t if end == s else s
                missing.setdefault(end, []).append((ltype, direction, other))
                node_by_id[end] = {
                    "id": end, "kind": GHOST_KIND.get(ltype, "Class"),
                    "name": iri_tail(end), "provenance": "ghost", "ghost": True,
                    "description": "Referenced by a loaded ontology, but not "
                                   "defined in any loaded file. See "
                                   "reports/missing-entities.txt.",
                    "product": "", "attrKind": "", "coRole": "",
                    "possibleValues": [], "unrestricted": False,
                    "unassigned": False, "val": 1,
                }
        links.append({"source": s, "target": t, "type": ltype})

    # definedBy: every entity from a dropped file hangs under the ontology
    # its file declares — this is what welds file contents to the import chain
    for n_id, ontos in defined_by.items():
        if n_id not in node_by_id:
            continue
        for o in ontos:
            if o in node_by_id:
                links.append({"source": n_id, "target": o, "type": "definedBy"})

    # owl:imports targets that were not loaded become phantom ontology nodes
    for s, t in pending_imports:
        for end in (s, t):
            if end not in node_by_id:
                node_by_id[end] = {
                    "id": end, "kind": "Ontology", "name": smart_iri_tail(end),
                    "provenance": "external-import", "ghost": True,
                    "description": "Imported ontology not present among the loaded files.",
                    "product": "", "attrKind": "", "coRole": "",
                    "possibleValues": [], "unrestricted": False,
                    "unassigned": False, "val": 1,
                }
        links.append({"source": s, "target": t, "type": "imports"})

    # ---- the container layer: store > graphs > ontologies > nodes --------
    # the onion made literal: everything loaded nests inside the store,
    # each file is a graph inside it, each ontology is hosted in its graph,
    # and every node hangs under its ontology (definedBy). Strata renders
    # this containment chain in depth.
    STORE_IRI = "https://colibri.example/data/store"

    def container_node(iri, kind, name, desc):
        return {
            "id": iri, "kind": kind, "name": name, "labels": {},
            "provenance": "runtime", "description": desc,
            "product": "", "attrKind": "", "coRole": "",
            "possibleValues": [], "unrestricted": False,
            "unassigned": False, "towerLevel": None, "val": 1,
        }

    node_by_id[STORE_IRI] = container_node(
        STORE_IRI, "Store", "runtime",
        "The running Python world: packages in the runtime, namespaces "
        "in packages, definitions in namespaces.")
    for stem, ontos in vocab_ontos + file_ontos:
        gira = f"https://colibri.example/data/graph/{stem}"
        node_by_id[gira] = container_node(
            gira, "Graph", stem,
            f"The package loaded from {stem}: everything it defines lives "
            f"here.")
        links.append({"source": gira, "target": STORE_IRI, "type": "storedIn"})
        for o in ontos:
            if o in node_by_id:
                links.append({"source": o, "target": gira, "type": "hostedIn"})

    # SHACL validation results: red exception-event nodes, one per violation
    for i, (focus, source, msg) in enumerate(violations):
        iri = f"https://colibri.example/data/validation/violation-{i}"
        node_by_id[iri] = {
            "id": iri, "kind": "Violation", "name": "violation",
            "labels": {}, "provenance": "shacl-validation",
            "description": msg, "product": "", "attrKind": "",
            "coRole": "", "possibleValues": [], "unrestricted": False,
            "unassigned": False, "towerLevel": None, "val": 1,
        }
        if source in node_by_id:
            links.append({"source": iri, "target": source,
                          "type": "violationOf"})
            sh = node_by_id[source]
            sh["violations"] = sh.get("violations", 0) + 1
        else:
            node_by_id[source] = {
                "id": source, "kind": "Shape", "name": iri_tail(source),
                "labels": {}, "provenance": "ghost", "ghost": True,
                "description": "Source shape not among the loaded nodes.",
                "product": "", "attrKind": "", "coRole": "",
                "possibleValues": [], "unrestricted": False,
                "unassigned": False, "towerLevel": None, "val": 1,
            }
            links.append({"source": iri, "target": source,
                          "type": "violationOf"})
        if focus in node_by_id:
            links.append({"source": iri, "target": focus,
                          "type": "violationAt"})
        else:
            node_by_id[focus] = {
                "id": focus, "kind": "Class", "name": iri_tail(focus),
                "labels": {}, "provenance": "ghost", "ghost": True,
                "description": "Focus node not among the loaded nodes.",
                "product": "", "attrKind": "", "coRole": "",
                "possibleValues": [], "unrestricted": False,
                "unassigned": False, "towerLevel": None, "val": 1,
            }
            links.append({"source": iri, "target": focus,
                          "type": "violationAt"})

    # ---- the flow layer: static data-flow fragments from extracted files ----
    # Graph-native JSON (no RDF): main()'s local variables, the flowIn /
    # flowOut / binds links between values, variables and callables, and
    # the ordered stage list the renderer plays with the Run button.
    flow_dir = ROOT / "data" / "flow"
    programs = []
    if flow_dir.exists():
        for f in sorted(flow_dir.glob("*.json")):
            try:
                frag = json.loads(f.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as err:
                print(f"  skipping flow fragment {f.name}: {err}")
                continue
            for n in frag.get("nodes", []):
                if n.get("id") in node_by_id:
                    continue
                node_by_id[n["id"]] = {
                    "id": n["id"], "kind": n.get("kind", "Variable"),
                    "name": n.get("name", iri_tail(n["id"])),
                    "labels": n.get("labels", {}),
                    "provenance": n.get("provenance", f.stem),
                    "description": n.get("description", ""),
                    "product": "", "attrKind": "", "coRole": "",
                    "possibleValues": [], "unrestricted": False,
                    "unassigned": False, "towerLevel": None,
                    "val": n.get("val", 1),
                }
            added = 0
            for l in frag.get("links", []):
                if (l["source"] in node_by_id and l["target"] in node_by_id
                        and l not in links):
                    links.append(l)
                    added += 1
            if frag.get("program"):
                programs.append(frag["program"])
            print(f"  flow fragment: {f.name} "
                  f"({len(frag.get('nodes', []))} nodes, {added} links)")

    # node size = weighted structural degree
    children, attrs_in, rels_in, out_refs = {}, {}, {}, {}
    for l in links:
        s, t = l["source"], l["target"]
        if l["type"] in HIER_LINKS:
            children[t] = children.get(t, 0) + 1
            out_refs[s] = out_refs.get(s, 0) + 1
        elif l["type"] == "assignedTo":
            attrs_in[t] = attrs_in.get(t, 0) + 1
            out_refs[s] = out_refs.get(s, 0) + 1
        else:  # head, tail, inScheme
            rels_in[t] = rels_in.get(t, 0) + 1
            out_refs[s] = out_refs.get(s, 0) + 1
    for n in node_by_id.values():
        n["subtypes"] = children.get(n["id"], 0)
        n["attrsAssigned"] = attrs_in.get(n["id"], 0)
        n["relEndpoints"] = rels_in.get(n["id"], 0)
        n["outRefs"] = out_refs.get(n["id"], 0)
        n["val"] = max(1, 3 * n["subtypes"] + 2 * n["attrsAssigned"]
                       + 2 * n["relEndpoints"] + n["outRefs"])

    nodes = list(node_by_id.values())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"nodes": nodes, "links": links}
    if programs:
        payload["program"] = programs[0]
        payload["programs"] = programs
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    # ---- missing entities report: what to hunt for in the system ----
    report = []
    by_ns = {}
    for iri, refs in missing.items():
        ns = iri.rsplit("#", 1)[0] if "#" in iri else iri.rsplit("/", 1)[0]
        by_ns.setdefault(ns, []).append(iri)
    report.append("MISSING ENTITIES — referenced by the loaded ontologies, "
                  "but not defined in any loaded file.")
    report.append("Drop the ontology files that define them into "
                  "data/ontologies/ and rebuild to close the gaps.")
    report.append("")
    report.append(f"total missing: {len(missing)} across {len(by_ns)} namespaces")
    report.append("")
    report.append("== by namespace (hunt these ontology files) ==")
    for ns, iris in sorted(by_ns.items(), key=lambda kv: -len(kv[1])):
        report.append(f"\n{ns}  ({len(iris)} missing)")
        for iri in sorted(iris):
            report.append(f"  {iri_tail(iri)}  <{iri}>")
            for ltype, direction, other in missing[iri]:
                other_name = node_by_id.get(other, {}).get("name", iri_tail(other))
                report.append(f"      {ltype} {direction} {other_name}")
    report.append("")
    external = [n for n in nodes if n.get("provenance") == "external-import"]
    if external:
        report.append("== unloaded import targets (owl:imports) ==")
        for n in external:
            report.append(f"  {n['name']}  <{n['id']}>")
    report_path = ROOT / "reports" / "missing-entities.txt"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")

    # connected components (union-find) — how fragmented the view is
    parent = {n["id"]: n["id"] for n in nodes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for l in links:
        a, b = find(l["source"]), find(l["target"])
        if a != b:
            parent[a] = b
    components = len({find(n["id"]) for n in nodes})

    print(f"graph loaded: {len(g)} triples")
    for name, triples, stamped in loaded:
        print(f"  ontology file: {name} ({triples} triples, {stamped} stamped nodes)")
    print(f"nodes: {len(nodes)}  links: {len(links)}  "
          f"components: {components}  -> {OUT.relative_to(ROOT)}")
    if missing:
        print(f"missing entities: {len(missing)} across {len(by_ns)} namespaces "
              f"-> {report_path.relative_to(ROOT)}")
        for ns, iris in sorted(by_ns.items(), key=lambda kv: -len(kv[1]))[:5]:
            print(f"  {len(iris):3d} missing in {ns}")
    if dropped:
        print(f"note: {dropped} links referenced unloaded entities; "
              f"they now appear as gray ghost nodes (see reports/missing-entities.txt)")

    by_kind, by_type = {}, {}
    for n in nodes:
        by_kind[n["kind"]] = by_kind.get(n["kind"], 0) + 1
    for l in links:
        by_type[l["type"]] = by_type.get(l["type"], 0) + 1
    print("nodes by kind:", by_kind)
    print("links by type:", by_type)
    if len(nodes) > 20000:
        print("WARN: more than 20,000 nodes; the browser may struggle")
        sys.exit(1)


if __name__ == "__main__":
    main()
