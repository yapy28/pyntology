# Pyntology — settled decisions and open work

One project: the lab, a 3D interpreter for small Python programs. This
file records what is decided and what is parked, so decisions survive
context and sessions. (The onion/RDF viewer and everything that existed
only for it were removed by decision — the museum floor, if it is ever
built, will be built natively in the lab world, not resurrected from
RDF.)

## The architecture (settled)

**Record, don't predict.** The interpreter is CPython: the tracer
(`src/record.py`) runs the program for real under `sys.settrace` and
captures what actually happened. Nothing is simulated. Any Python file
can be rendered because CPython did the understanding.

The pipeline:

```
lessons/*.py ──record.py──▶ web/tapes/*.json ──lab.js──▶ the scene
   (program)                  (the tape: events,        (fold of events,
                               capped facts)             idempotent)
```

- The tape carries the event taxonomy: start/end, line events (with
  literals as static matter), assignments (locals diffing), call
  enter/return, output capture, exceptions. Values are capped facts
  `{type, repr, len}`.
- The renderer never parses Python. The scene at frame f is the fold of
  events 0..f — idempotent, so the playhead scrubs anywhere and the
  inspector answers "what does this hold at this exact moment".
- `record.py` decides what is true; `lab.js` decides what it looks like.
  The only contract between them is the tape schema.

## Hard rules

- **No network, ever.** Local processes only, at record time and view
  time. Real-data tapes stay local-only and gitignored; lesson tapes
  are toy data end to end and are committable.
- **Toy inputs only** for anything recorded.

## The shape language (settled contract, vocabulary still iterating)

- **Matter from physics, motion from machinery.** If a shape carries no
  semantic truth of Python, it is decoration and is rejected.
- **The moving thing is the data.** Boxes are lines of code (readable
  code on the face, in reading order); pipes carry balls (values in
  transit, transit glows); the working box is the playhead. No empty
  vehicles, no trams that carry nothing.
- **No figurative sculpture.** Apparatus is geometric glyphs plus
  labels; the metaphor lives in motion. (Killed: the DNA helix, the
  microscope statue, the bench-with-ring.)
- **Identity by hover and click, never floating billboards.**
- **The scene speaks metaphor; the inspector speaks Python.** Panels
  give run facts first (what actually happened in this recording), one
  plain teaching sentence, and documentation only on demand.
- **Every shape defines scale first** — behavior at 10 items and at
  10,000 items — before anything else. See docs/shapes.md (note: its
  entries predate the boxes/pipes/balls contract and await a rewrite).

## Sequencing (settled)

Iterate on the animation vocabulary for lesson 1 until it is right,
*then* scale to the lesson corpus (hello, pay, overtime, computepay,
min/max, string surgery, files, lists, dicts, tuples, then compounds —
the PY4E-ordered spiral), then user programs.

## Open work, in order

1. **Visual quality pass on lesson 1** — the current render is raw
   primitives with flat Lambert shading; it needs physically-based
   materials, soft shadows, ACES tone mapping, bloom, and motion with
   weight. Same tape, same fold; only vocabulary fidelity changes.
2. **Lessons 2-10**, one shape-forcing program per build, after the
   vocabulary settles.
3. **docs/shapes.md rewrite** to the boxes/pipes/balls contract.

## Parked (do not build until triggered)

- **A declarative mapping language.** The tape→scene rules currently
  live as code in `lab.js` (applyFrame + the build* functions); ideally
  they would be a human-readable mapping document (the R2RML/RML move:
  event kind → shape, with conditions and scale rules) that a compiler
  turns into renderer structures — reviewable, diffable, authorable
  without touching the engine. Trigger to build: the vocabulary is
  stable AND a lesson's behavior needs changing without renderer edits,
  or the user wants to author mappings directly. Building it earlier
  means churning the language while the shapes still churn.
- **Engine swap option.** If three.js quality caps out, Babylon.js or
  Godot-web consuming the same tapes is the fallback; the tape schema
  survives any swap, which is the point of the architecture.
- **The museum floor.** Python itself as a visual (the periodic table
  of types, the instrument catalog, the laws) above the lab rooms, with
  the two floors welded by physical identity. If built, it will be
  built natively in the lab world (a static level of the same renderer),
  not resurrected from the removed RDF pipeline. Blocked on: the lab
  vocabulary settling first.
- **Runtime value provenance for the inspector** (cracking open
  containers, full contents at any frame) — needed by lesson 3+.
