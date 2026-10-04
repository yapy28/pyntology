# Pyntology

See Python. Two views, one project:

- **The lab** — a small Python program rendered as a laboratory
  experiment: values are matter with physical shape (`str` is a helix,
  numbers are orbs), the program is apparatus on a bench, and
  `print` is a microscope that observes without transforming. Every
  visual fact comes from a *tape* — the honest record of one real run,
  played back with a draggable playhead. Learn the shape language in
  [docs/shapes.md](docs/shapes.md).
- **The onion** — Python itself as a world: the type tower, protocols,
  exceptions, the runtime, rendered as nested containment bubbles.
  The map of what things *are*; the lab is the movie of what they *do*.

Forked from [Colibri](https://github.com/yapy28/colibri), the RDF/OWL/SKOS
ontology viewer. The onion pipeline is still RDF underneath; the lab is
graph-native and record-based.

## The lab: record a program, watch it run

```bash
.venv/bin/python src/record.py lessons/01_hello.py     # run + record -> web/tapes/01_hello.json
python3 -m http.server -d web                           # open http://localhost:8000/lab.html
python3 build/export_lab.py "lesson 1: hello" \
    --tape web/tapes/01_hello.json --out dist/01-hello.html   # standalone shareable asset
```

`src/record.py` really executes the program under `sys.settrace` — it is
never simulated — and captures the moments that matter (the event
taxonomy): start/end, line events with their literals, assignments,
call enter/return, output, exceptions. Values are capped facts
(`{type, repr, len}`), enough to inspect any value at any frame and never
more than the program itself knew.

The renderer folds events into scene state, so the playhead scrubs
anywhere and the inspector always answers "what does this hold at this
exact moment".

**Feed the recorder toy inputs only.** Lesson programs are written so
their data is fabricated end to end; tapes from real data stay
local-only and gitignored.

## The lessons

`lessons/` is a curriculum in the spirit of Python for Everybody: each
lesson is a tiny program that forces exactly one new shape into
existence — hello (helix + microscope), pay (orbs + tethers), overtime
(junction), computepay (chamber), min/max (oscillating gate, alarm),
string surgery, files (tanks), lists (breakable-bond molecules), dicts
(crystal lattices), tuples (covalent molecules) — then the programs
compound: the spiral continues with real programs, unbounded.

## The onion

```bash
.venv/bin/python src/extract_python.py     # describe the running CPython
.venv/bin/python src/extract_python_file.py some_file.py   # a file's A-box + flow layer
.venv/bin/python build/build.py           # RDF + data/ontologies/* -> web/graph.json
.venv/bin/python build/build_file_view.py some-file         # scoped view of one file
node scripts/verify_web.mjs               # serves web/ and checks everything
python3 -m http.server -d web              # http://localhost:8000 (onion.html)
```

The two deepest edges in the graph are worth a click: `object` is an
*instance* of `type`, and `type` is a *subclass* of `object` — the braid —
and `type` is an instance of itself, the fixed point of the tower.

## No network, ever

Hard project rule: the tracer, the build, the renderers and the exports
are plain local processes. No cloud, no API calls, no telemetry —
nothing leaves the machine, at record time or at view time. This is
what makes real-data runs a policy question instead of a leak, and what
makes the whole thing usable anywhere.

## Docs

| File | Contents |
|------|----------|
| [docs/shapes.md](docs/shapes.md) | The shape language: entry contract, every shape, why it is what it is |
| [DESIGN.md](DESIGN.md) | Settled decisions, scope, open homework |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit |
