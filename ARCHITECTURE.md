# Architecture

## System diagram

```mermaid
flowchart TD
    subgraph P1["PHASE 1 — PoC, built now"]
        direction TB
        subgraph sources["Source"]
            docs["📄 Collibra OOTB operating model<br/>public docs, productresources.collibra.com<br/><i>transcribed by agent, verified by you</i>"]
        end
        subgraph model["Canonical model"]
            vocab["📐 colibri: vocabulary<br/>RDFS-light, ~25 terms, Turtle"]
            rdf[("🧊 colibri RDF named graph<br/>~300 nodes / ~400 edges")]
        end
        subgraph pipeline["Pipeline"]
            build["⚙️ build.py<br/>Python 3 + rdflib, SPARQL transforms"]
            json["📦 graph.json<br/>static nodes + links"]
        end
        subgraph frontend["Frontend"]
            viz["🌐 index.html — one static page<br/>3d-force-graph, WebGL, three.js"]
            feats["🖱️ Modes: free-force + DAG zout<br/>z-axis = inheritance strata<br/>provenance colors · 1-hop highlight<br/>search · click panel · expand-to-root"]
        end
        docs --> rdf
        vocab --> rdf
        rdf --> build
        build --> json
        json --> viz
        viz --- feats
    end

    subgraph P2["PHASE 2 — parked, pre-pitch"]
        direction LR
        mf["🗄️ metaphactory SPARQL<br/>ontology registry probes<br/>cheap subject-indexed queries only"]
        org["🏢 Org's real Collibra<br/>reader UI now, REST API once granted"]
        mapping["🔗 colibri:mapsTo<br/>ontology ↔ Collibra join"]
    end

    subgraph P3["PHASE 3 — post-adoption"]
        store["⚡ Live RDF store<br/>GraphDB / metaphactory<br/>full metadata graph, live queries"]
    end

    P1 -.->|PoC verified| P2
    mf --> mapping
    org --> mapping
    mapping -.->|joins into| rdf
    P2 -.->|pitch lands| P3
```

## Tech choices per step

| Step | Tech | Why this and not the alternative |
|------|------|----------------------------------|
| Source | Collibra public OOTB docs | No trial clock ticking, no API access needed; the metamodel is public |
| Canonical model | RDF, Turtle, RDFS-light | The artifact *is* an RDF knowledge graph — portable into the Phase 3 store unchanged, and mergeable with metaphactory's own Turtle exports in Phase 2 |
| Vocabulary | `colibri:` + `skos`, `rdfs`, `prov` | Tiny and readable; `colibri:mapsTo` reserved now so the Phase 2 join needs zero remodeling |
| Build | Python 3 + rdflib | SPARQL transforms in a script, no server; easy to verify against docs |
| Export | static JSON | ~300 nodes ship whole to the browser — no backend, nothing to break in the demo |
| Viz | 3d-force-graph (WebGL) | Native DAG `zout` mode = the z-axis inheritance strata; free-force toggle; renders one file |
| Interaction | vanilla JS, client-side | 1-hop highlight, expand-to-root = pointer-walking; no query engine at runtime — which is why Neo4j stays out |
| Phase 2 join | `colibri:mapsTo` | Already in the model; Phase 2 only supplies data |
| Phase 3 store | GraphDB or metaphactory itself | Queries become live; RDF stays canonical — no property-graph detour |

## Caveats

- The ~300 nodes / ~400 edges figure is an estimate from the docs' breadth, to be confirmed during transcription. The pipeline does not depend on the exact count.
- The Mermaid block above was not machine-validated (no `mmdc` in this environment); it uses the same conservative syntax already rendered successfully in chat.
