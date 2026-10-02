# Design — settled decisions

This is the shared understanding reached before any code was written. Everything here is decided unless explicitly marked *parked* or *homework*.

## The asset

One RDF knowledge graph, `colibri:`, unifying the Collibra operating model (and later the organization's real operating model and the metaphactory ontology registry) in a single interactive 3D page. The RDF graph is the artifact; the 3D page is its face.

## Phase 1 — PoC (build now)

- **Data**: Collibra out-of-the-box operating model, transcribed from the public docs at productresources.collibra.com. No Collibra trial instance, no API access needed. Estimated ~300 nodes / ~400 edges (estimate, to be confirmed during transcription).
- **Vocabulary**: `colibri:` namespace, RDFS-light, ~25 terms, Turtle serialization, one named graph:
  - Classes: AssetType, AttributeType, RelationType
  - `rdfs:subClassOf` for the type hierarchy — drives the z-axis
  - `skos:prefLabel` for names
  - `colibri:provenance` — `"collibra-ootb"` | `"metaphactory"` | `"mock"`
  - `colibri:mapsTo` — reserved for the ontology-to-Collibra join, populated in Phase 2
  - No OWL restrictions, no SHACL in v1.
- **Pipeline**: Python 3 + rdflib build script transforms the RDF graph into a static nodes/links JSON.
- **Generic ontology loader** (Tier 1): RDF files dropped into `data/ontologies/` (`.ttl`, `.owl`, `.rdf`, `.nt`, `.n3`, `.jsonld`) are loaded and merged at build time. Standard OWL/SKOS mapping: `owl:Ontology`/`owl:Class`/properties/`skos:ConceptScheme`/`skos:Concept` become nodes with kinds ontology/class/property/vocabulary/concept; `rdfs:subClassOf`, `rdfs:subPropertyOf`, `skos:broader`, `owl:imports` become hierarchy links; `skos:inScheme` links concepts to vocabularies. Provenance is the file stem; `owl:imports` targets that were not loaded appear as phantom ontology nodes (`external-import`). Strata mode layers along all four hierarchy link types, so ontology import stacks render in depth. Blank nodes are skipped; the browser tops out around 20,000 nodes, so bring schema-level ontologies, not instance data. This is also the Phase 2 ingestion path for metaphactory Turtle exports.
- **Frontend**: single static HTML page, 3d-force-graph (WebGL). No server, no framework, no auth.
- **Interactions** (all client-side JS, no query engine at runtime):
  - Layout modes: free-force 3D and Strata (DAG `zout` — depth = inheritance strata, subclass links only)
  - Colors by node kind (asset / attribute / relation; the synthetic root is magenta). Provenance is uniform (`collibra-ootb`) in Phase 1, so it is shown in the click panel instead of the color; colors switch to provenance when Phase 2 mixes sources.
  - Hover/select: 1-hop highlight in all directions, dim the rest
  - Click panel: label, description, provenance badge, path to `Asset` root, direct subtypes, assigned asset types (attributes), head/tail and co-role (relations), possible values (selection attributes)
  - Search box with fly-to on Enter
  - Path-to-root highlight and fly-to buttons
- **Definition of running (v1 bar)**: one HTML page, loads one JSON, renders the metamodel with provenance colors, layered z-axis, click panel, search, and at least one visible edge connecting an ontology entity to its Collibra counterpart (via `colibri:mapsTo`, even if hand-set for the demo).

## The z-axis semantics

Depth is not decoration. Phase 1: inheritance distance from `Asset`. Later: ontology import strata — base ontologies at the bottom, importers stacked upward, so the ontology stack can be flown through as geological layers. This is the pitch's money shot.

## No Neo4j

RDF stays canonical. Neo4j buys nothing for a static dump-render pipeline: the interactive features (1-hop highlight, expand-to-root, subclass chains) are client-side pointer-walking over a small JSON. The only moment a store becomes interesting is live querying (Phase 3), and the natural home is an RDF store (GraphDB or metaphactory itself), where the graph already lives. Porting to a property graph would discard the ontological identity of the exercise.

## Phase 2 — before the pitch (parked, prepped on the user's side)

- Prepare the metaphactory structure (ontology registry via cheap, subject-indexed SPARQL probes) and the `colibri:mapsTo` mapping from there to the Collibra environment.
- Transcribe the organization's real operating model: check whether Settings → Operating Model → Asset types is visible with reader access; request Collibra API read access framed as a read-only metadata audit.
- Swap the real operating model into the same pipeline.

## Pitch gate

Pitch only when Phase 2 lands — the default model alone is a visualization of Collibra's world; the real operating model is the team lead's world. Two extra weeks for that difference is the highest-leverage time in the project.

## Established facts (verified via web research)

- Collibra has a REST API (`/rest/2.0`) and a GraphQL API; authentication via basic auth, OAuth2 client credentials, or JWT. Permissions are RBAC-based — a reader with API access can GET everything visible in the UI.
- Free trials are short and gated: 14-day Data Intelligence Cloud trial via partners, 20-day Data Quality & Observability trial on AWS Marketplace. Consequence: write extraction code against docs and mocks *before* burning a trial.
- The out-of-the-box operating model (asset types, attribute types, relation types) is fully documented publicly — the metamodel is available without any instance.
- metaphactory has a SPARQL editor, the Graph Store HTTP Protocol (whole-graph HTTP downloads — the cheap extraction path when store-side heavy queries are slow), a built-in `semantic-graph` component, and an SDK for custom components.

## Homework — facts to collect (user's environment, not discoverable from here)

1. Is Settings → Operating Model visible with the current reader account in the organization's Collibra?
2. Which store backs metaphactory (GraphDB, Virtuoso, Stardog, Neptune)? Determines the cheap extraction paths and the Phase 3 live store.
3. Does the generation pipeline stamp Collibra assets with the source ontology IRI (attribute, externalId, or naming convention)? If not, propose adding it as part of the pitch — reframe the gap as traceability.
4. Cheap probe for the next metaphactory session (subject-indexed, no aggregation):
   `SELECT ?ont WHERE { GRAPH ?g { ?ont a owl:Ontology } } LIMIT 50`
   Already confirmed to return results quickly.

## Parked for a later session

- metaphactory exploratory analysis: store identification, named-graph registry, cross-graph reference mapping, timeout diagnosis. Known signal: a `LIMIT 100` graph-enumeration query nearly timed out, while subject-indexed queries are fast — so the earlier timeouts were aggregation costs or configuration (metaphactory label service auto-enrichment is a known suspect), not scale or a broken store. Diagnosis before queries.
