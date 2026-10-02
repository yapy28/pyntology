# Colibri

![Colibri](assets/colibri.png)

A tiny bird's-eye view: RDF in, one interactive 3D page out. A bird's-RDF view, if you prefer.

Built in RDF (`colibri:` vocabulary, RDFS-light, Turtle), extracted and transformed with Python + rdflib, and visualized with 3d-force-graph (WebGL) in a single static HTML file. The name is Collibra with its beak on — a bird that hovers in front of every flower in the garden and inspects them one by one.

The 3D dimension is semantic, not decorative: the z-axis shows strata — inheritance depth in Phase 1, ontology import depth once metaphactory data lands.

## Context

The organization builds ontologies and SKOS vocabularies in metaphactory and generates Collibra datasets and data objects from them. Colibri is the reverse view: the Collibra metadata world as a knowledge graph, starting with the operating model (asset types, attribute types, relation types) and growing toward the full catalog, joined back to the ontology layer via `colibri:mapsTo`.

## Status

Phase 1 (PoC) — built and passing checks. See [ROADMAP.md](ROADMAP.md).

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
python3 sources/fetch_sources.py            # fetch the doc snapshots (pinned to doc version 2026.02)
.venv/bin/python src/extract_ootb.py       # docs snapshots -> RDF (tmp/ootb-metamodel.ttl)
.venv/bin/python src/check_metamodel.py    # integrity checks on the RDF
.venv/bin/python build/build.py            # RDF + data/ontologies/* -> web/graph.json
                                          # (ontologies only; add --with-collibra for the operating model)
node scripts/verify_web.mjs                # serves web/ and checks everything
python3 -m http.server -d web               # then open http://localhost:8000
```

**Bring your own ontologies**: drop `.ttl` / `.owl` / `.rdf` / `.nt` / `.jsonld` files into `data/ontologies/` and rebuild — classes, properties, SKOS vocabularies and `owl:imports` structure render alongside the operating model. See `data/ontologies/README.md` for the mapping rules.

## Export a standalone HTML

Bundle the current graph into a single self-contained HTML file — open it
directly in any browser, no server, no internet, perfect for sharing as an
asset (e.g. attached to a chat or email):

```bash
.venv/bin/python build/build.py        # build the graph you want to ship
python build/export_html.py           # -> dist/colibri.html
```

The exporter inlines the graph data, the app, the logos and the
3d-force-graph library (fetched from unpkg at export time). The file
contains whatever the last build produced, so rebuild first if you changed
the ontologies.

## Anonymize before sharing

`tools/anonymize.py` does bulk search-and-replace across a folder of RDF
files, with a dry run by default, per-file hit report and a post-write
leak check:

```bash
python tools/anonymize.py <folder> --map tools/anonymize-map.json             # dry run
python tools/anonymize.py <folder> --map tools/anonymize-map.json --write     # apply
python tools/anonymize.py <folder> --map tools/anonymize-map.json --write --ignore-case
```

The map is a JSON object of original -> replacement strings, applied as
plain substring replacements (so IRIs, prefixes, literals and comments are
all covered). The map file contains real names: `tools/anonymize-map.json`
is gitignored — keep it there or outside the repo, and never commit it.
See `tools/anonymize-map.example.json` for the format.

## The Python ontology

`vocabulary/py-vocabulary.ttl` is an ontology of Python itself: the tower
(values -> types -> metatypes -> type, the fixed point), structural
protocols, callable contracts with exception outcomes, and an execution
layer. `src/extract_python.py` introspects a CPython interpreter and emits
`data/ontologies/python-builtin.ttl` — the builtins with their `instanceOf`
tower edges, direct `subclassOf` lattice, linearized `mroNext` chains and
exception taxonomy. All derived facts are materialized offline; nothing
needs a runtime reasoner.

```bash
.venv/bin/python src/extract_python.py    # describe the running CPython
.venv/bin/python build/build.py          # renders alongside any dropped ontologies
```

The two deepest edges in the graph are worth a click: `object` is an
*instance* of `type`, and `type` is a *subclass* of `object` — the braid —
and `type` is an instance of itself, the fixed point of the tower.

## Run it on Windows

Same pipeline; the venv interpreter lives in `.venv\Scripts\` instead of `.venv/bin/`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
python sources\fetch_sources.py
.venv\Scripts\python src\extract_ootb.py
.venv\Scripts\python src\check_metamodel.py
.venv\Scripts\python build\build.py        # ontologies only; --with-collibra adds the operating model
node scripts\verify_web.mjspython -m http.server -d web     # then open http://localhost:8000
```

Notes: `python` (not `python3`) on Windows. Node.js is optional — it is only used by `scripts/verify_web.mjs`, the end-to-end web check; the build pipeline itself is pure Python. If the VM has no internet, copy `sources/raw/` over manually and skip the fetch. If console output trips over non-ASCII characters, set `PYTHONUTF8=1` first.

Pipeline refresh: `python sources/fetch_sources.py` re-pulls the doc snapshots (pinned to version 2026.02); standard library only, no Node.js needed.

## Docs

| File | Contents |
|------|----------|
| [DESIGN.md](DESIGN.md) | Settled decisions, scope, facts, open homework |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram and tech choices per step |
| [ROADMAP.md](ROADMAP.md) | Phases, tasks, parked items |
| [sources/SOURCES.md](sources/SOURCES.md) | Origin documentation for every node in the metamodel |
