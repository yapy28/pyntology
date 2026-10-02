# Roadmap

## Phase 1 — PoC (built, checks passing)

- [x] Scaffold the project: `colibri:` vocabulary, extractor, build script, HTML page
- [x] Author the `colibri:` RDFS-light vocabulary (Turtle, `vocabulary/colibri-vocabulary.ttl`)
- [x] Transcribe the Collibra OOTB operating model to RDF from the public docs (`src/extract_ootb.py` -> `tmp/ootb-metamodel.ttl`, every node traceable to its source row)
- [x] rdflib build script -> nodes/links JSON (`build/build.py` -> `web/graph.json`, 1,023 links)
- [x] Single-page 3d-force-graph: free-force + Strata (DAG `zout`) modes, kind colors, 1-hop highlight, search, click panel, expand-to-root, fly-to
- [x] Verify end-to-end: `src/check_metamodel.py` (RDF integrity) and `scripts/verify_web.mjs` (serve + fetch + referential + acyclicity checks) both pass
- [x] Generic ontology loader: drop OWL/SKOS RDF files into `data/ontologies/`, rebuild, and they render with per-file provenance; `owl:imports` structure layers in Strata mode, unloaded import targets appear as external phantoms

## Phase 2 — parked, pre-pitch

- [ ] Prepare the metaphactory structure: ontology registry via cheap subject-indexed SPARQL probes
- [ ] Build the `colibri:mapsTo` mapping from the metaphactory ontology registry to the Collibra environment
- [ ] Transcribe the organization's real operating model
  - Check whether Settings → Operating Model → Asset types is visible with reader access
  - Request Collibra API read access, framed as a read-only metadata audit
- [ ] Swap the real operating model into the same pipeline

## Pitch gate

Pitch to the team lead only after Phase 2 lands — the demo must show the organization's world, not Collibra's default world.

## Phase 3 — parked, post-adoption

- [ ] metaphactory exploratory session: identify the backing store, diagnose the `LIMIT 100` timeout (suspect: label service auto-enrichment or missing index — subject-indexed queries are fast, so it is configuration, not scale), map the named-graph registry and cross-graph references
- [ ] Live RDF store (GraphDB or metaphactory) serving the full metadata graph
- [ ] Live queries replacing the static JSON dump
