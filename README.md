# Pyntology

A 3D interpreter for small Python programs: run a program, record what
it really did, and watch the recording as matter flowing through boxes
and pipes — a laboratory for learning Python by *seeing* it run.

- **Boxes are lines of code** — readable code on the box face, laid out
  in reading order
- **Pipes carry balls** — values are matter in transit; transit glows,
  arrival lands
- **The working box is the playhead** — execution is which box's pipes
  are active; the moving thing is always the data
- **The inspector speaks Python** — run facts first, one plain teaching
  sentence, documentation only on demand
- Every visual fact comes from a **tape** — the honest record of one
  real run. Nothing is simulated, nothing hand-drawn.

## The pipeline

```
lessons/*.py ──record.py──▶ web/tapes/*.json ──lab.js──▶ the scene
  (program)                  (the tape: events,      (fold of events,
                              capped facts)           idempotent)
```

`src/record.py` executes the program under `sys.settrace` and captures
the event taxonomy: start/end, lines with their literals, assignments,
call enter/return, output, exceptions. `lab.js` folds events into scene
state, so the playhead scrubs anywhere and the inspector answers "what
does this hold at this exact moment". `record.py` decides what is true;
`lab.js` decides what it looks like; the tape schema is the only
contract between them.

Pure standard library — no dependencies, no venv needed.

## Run it

```bash
python3 src/record.py lessons/01_hello.py     # run + record -> web/tapes/
python3 -m http.server -d web                 # open http://localhost:8000/lab.html
python3 build/export_lab.py "lesson 1: hello" \
    --tape web/tapes/01_hello.json --out dist/01-hello.html   # standalone asset
```

## The lessons

`lessons/` is a curriculum in the spirit of Python for Everybody: each
lesson is a tiny program that forces exactly one new shape into
existence — hello (a string ball), pay (numbers, variables), overtime
(branches), computepay (functions as machines), min/max (loops,
exceptions), string surgery, files (tanks), lists, dicts, tuples — then
the programs compound, unbounded. Iterate the vocabulary until it is
right, then scale to the corpus.

## No network, ever

Hard project rule: the tracer, the renderer and the exports are plain
local processes. No cloud, no API calls, no telemetry — nothing leaves
the machine, at record time or at view time. Feed the recorder toy
inputs only; lesson tapes are fabricated data end to end and safe to
share.

## Docs

| File | Contents |
|------|----------|
| [docs/concepts.csv](docs/concepts.csv) + [docs/relations.csv](docs/relations.csv) | The concept database: one row per Python concept, controlled columns, load into Google Sheets |
| [docs/concepts.md](docs/concepts.md) | The database rendered readable (generated; edit the CSVs, never this) |
| [docs/shapes.md](docs/shapes.md) | The shape language: entry contract, every shape, why it is what it is |
| [sources/](sources/SOURCES.md) | The documentation library: the complete official Python docs + the w3schools tutorial, fetched locally, read before every definition |
| [DESIGN.md](DESIGN.md) | Settled decisions, hard rules, open work, parking lot |

The database has a cop and a renderer, both pure stdlib:

```bash
python3 src/check_concepts.py     # validate: controlled vocabulary enforced
python3 src/render_concepts.py    # regenerate docs/concepts.md from the CSVs
```
