#!/usr/bin/env python3
"""Sanity checks for tmp/ootb-metamodel.ttl: no dangling references, a single
parentless 'Asset' root, every attribute type assigned, every relation type
with head and tail, plus provenance/kind summaries. Exits non-zero on failure.

Run with the project venv: .venv/bin/python src/check_metamodel.py
"""

import sys
from collections import Counter
from pathlib import Path

from rdflib import Graph, Namespace, RDF, SKOS, URIRef

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "tmp" / "ootb-metamodel.ttl"

COL = Namespace("https://colibri.example/ns/colibri#")
RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")

g = Graph()
g.parse(DOC, format="turtle")

types = [COL.AssetType, COL.AttributeType, COL.RelationType]
nodes = set()
for t in types:
    nodes |= set(g.subjects(RDF.type, t))

errors = []

# every object reference must land on a typed node
for p in (RDFS.subClassOf, COL.assignedTo, COL.head, COL.tail):
    for o in g.objects(None, p):
        if isinstance(o, URIRef) and o not in nodes:
            errors.append(f"dangling {p.split('#')[-1]}: {o}")

parentless = [s for s in g.subjects(RDF.type, COL.AssetType)
              if not list(g.objects(s, RDFS.subClassOf))]
labels = {s: str(next(g.objects(s, SKOS.prefLabel), str(s))) for s in parentless}
if len(parentless) != 1 or "Asset" not in labels.values():
    errors.append(f"expected exactly one parentless 'Asset' root, got: {list(labels.values())}")

orphan_attrs = [str(next(g.objects(s, SKOS.prefLabel), str(s)))
                for s in g.subjects(RDF.type, COL.AttributeType)
                if not list(g.objects(s, COL.assignedTo))]
if orphan_attrs:
    errors.append(f"attribute types without any assignment: {orphan_attrs[:8]}")

bad_relations = [str(next(g.objects(s, SKOS.prefLabel), str(s)))
                 for s in g.subjects(RDF.type, COL.RelationType)
                 if not list(g.objects(s, COL.head)) or not list(g.objects(s, COL.tail))]
if bad_relations:
    errors.append(f"relation types without head/tail: {bad_relations[:8]}")

print(f"triples: {len(g)}  nodes: {len(nodes)}")
print("by type:", dict(Counter(str(t).split('#')[-1] for t in types
                               for _ in g.subjects(RDF.type, t))))
print("by provenance:", dict(Counter(str(o) for o in g.objects(None, COL.provenance))))
print("attribute kinds:", dict(Counter(str(o) for o in g.objects(None, COL.kind))))

if errors:
    print("\nFAIL:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("\nall checks passed")
