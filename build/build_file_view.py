#!/usr/bin/env python3
"""Build a scoped view of one file's instances inside the Python ontology.

Given a provenance stem (the file stem used by extract_python_file.py), this
computes the closure of that file's world:

1. runs build.py once (the full graph lands in web/graph.json)
2. seeds    = every node with the given provenance (the file's individuals)
3. one hop  = everything the seeds link to in either direction
4. ancestors = every tower/lattice parent of every included node, so the
   ontology skeleton (object, type, the class lattice up the chain) stays
   visible in strata mode

Everything else is left out. The result lands in web/file-graph.json and is
exported as a separate standalone HTML, e.g.:

  .venv/bin/python build/build_file_view.py categorize-violations
  python3 build/export_html.py --graph web/file-graph.json \\
      --out dist/categorize-violations.html
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HIER = ("subclass", "subProperty", "broader", "imports",
        "instanceOf", "metaclassOf", "mroNext")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("provenance",
                    help="provenance stem of the file (e.g. categorize-violations)")
    ap.add_argument("--graph-out", default=str(ROOT / "web" / "file-graph.json"))
    args = ap.parse_args()

    # 1. full build
    res = subprocess.run([sys.executable, str(ROOT / "build" / "build.py")],
                         capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout[-2000:])
        print(res.stderr[-2000:])
        raise SystemExit("build.py failed")
    for line in res.stdout.splitlines():
        if line.startswith(("nodes:", "mode:")):
            print(line)

    data = json.loads((ROOT / "web" / "graph.json").read_text(encoding="utf-8"))
    nodes, links = data["nodes"], data["links"]
    by_id = {n["id"]: n for n in nodes}

    seeds = {n["id"] for n in nodes if n.get("provenance") == args.provenance}
    if not seeds:
        stems = sorted({n.get("provenance") for n in nodes if n.get("provenance")})
        raise SystemExit(f"no nodes with provenance {args.provenance!r}. "
                         f"Available: {', '.join(stems)}")

    include = set(seeds)

    # 2. forward expansion to fixpoint: what the file's world points AT
    # (its types, its callees, its bases). Never in reverse: 'type' is the
    # hub of every instanceOf edge in the ontology, and following incoming
    # edges would pull the entire builtin ontology in. definedBy is an
    # organizational hub edge and is not followed either.
    EXPAND_SKIP = {"definedBy"}
    changed = True
    while changed:
        changed = False
        for l in links:
            if l["type"] in EXPAND_SKIP:
                continue
            if l["source"] in include and l["target"] not in include:
                include.add(l["target"])
                changed = True

    # 3. ancestors over hierarchy links (cycle-safe: include-set is the guard)
    #    so the tower skeleton stays visible: object, type, the class chains
    parents = {}
    for l in links:
        if l["type"] in HIER and l["source"] not in parents:
            parents[l["source"]] = l["target"]
    for start in list(include):
        cur = start
        while cur in parents:
            nxt = parents[cur]
            if nxt in include:
                break
            include.add(nxt)
            cur = nxt

    out_nodes = [by_id[i] for i in include if i in by_id]
    out_links = [l for l in links
                 if l["source"] in include and l["target"] in include]

    graph_out = Path(args.graph_out)
    graph_out.write_text(json.dumps({"nodes": out_nodes, "links": out_links},
                                    ensure_ascii=False), encoding="utf-8")

    by_kind, by_prov, by_type = {}, {}, {}
    for n in out_nodes:
        by_kind[n["kind"]] = by_kind.get(n["kind"], 0) + 1
        by_prov[n.get("provenance") or "?"] = by_prov.get(n.get("provenance") or "?", 0) + 1
    for l in out_links:
        by_type[l["type"]] = by_type.get(l["type"], 0) + 1
    print(f"\nscoped view for {args.provenance!r}:")
    print(f"  seeds: {len(seeds)}  nodes: {len(out_nodes)}  links: {len(out_links)}")
    print(f"  nodes by kind: {by_kind}")
    print(f"  nodes by provenance: {by_prov}")
    print(f"  links by type: {by_type}")
    print(f"  -> {graph_out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
