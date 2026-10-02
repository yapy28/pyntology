# The ontology drop zone

Drop RDF files here, rebuild, and they appear in the graph alongside the
Collibra operating model.

Accepted: `.ttl`, `.owl`, `.rdf`, `.nt`, `.n3`, `.jsonld`

Then run:

```bash
.venv/bin/python build/build.py
```

## What gets mapped

| In your file | In the graph |
|--------------|--------------|
| `owl:Ontology` | node of kind *ontology* |
| `owl:Class` | node of kind *class* |
| `owl:ObjectProperty` / `owl:DatatypeProperty` / `owl:AnnotationProperty` | node of kind *property* |
| `skos:ConceptScheme` | node of kind *vocabulary* |
| `skos:Concept` | node of kind *concept* |
| `rdfs:subClassOf`, `rdfs:subPropertyOf`, `skos:broader`, `owl:imports` | hierarchy links (drive Strata mode) |
| `skos:inScheme` | link from concept to its vocabulary |
| `rdfs:label` or `skos:prefLabel` | node name |
| `rdfs:comment` or `skos:definition` | node description |

Rules of thumb:

- **Provenance** of nodes from a dropped file is the file stem — visible in
  the click panel, so different sources stay distinguishable.
- **`owl:imports` targets that were not loaded** still appear, as phantom
  ontology nodes with provenance `external-import` — you can see the import
  structure even with partial files.
- **Strata mode** layers along `subClassOf` / `subPropertyOf` / `broader` /
  `imports`: base ontologies sit deeper, importers stack upward.
- The browser is comfortable to roughly **20,000 nodes**; bring schema-level
  ontologies (classes, properties, concepts), not instance data.
- Blank nodes are skipped.
- After every build, `reports/missing-entities.txt` lists everything the
  loaded files reference that no loaded file defines — grouped by namespace,
  with the referencing link — plus all `owl:imports` targets that were not
  loaded. Use it to hunt for the ontology files still missing.
- `build/build.py` renders the files in this directory by default; pass
  `--with-collibra` to also load the Collibra operating model.
