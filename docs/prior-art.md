# Prior art: Python Tutor (pythontutor.com)

Source: its public design doc (fetched to
`sources/raw/prior-art/pythontutor-design.txt`), Philip Guo's nonprofit
academic project, running since ~2010, used at scale for intro courses.

## Its model (in its own words)

Imitate "what an instructor draws on the blackboard": small
self-contained code, few steps, no external resources, explicitly not
a debugger. Its theory of action: replace the two common run-time
inspection techniques - print statements and debuggers - with a
zero-setup UI that visualizes all run-time state at all executed
lines.

## What it does not do, on purpose

- Code too large, too many steps (>100), too many variables
- External resources: files, databases, networking, most imports
  (fixed allowlist), argv, GUIs, threads
- No stepping within a line: sub-expression evaluation is invisible;
  the workaround is splitting complex expressions into multiple lines
- End-of-execution events are not visualized: garbage collector runs,
  GeneratorExit - untethered objects never visibly vanish
- `__del__` timing differs: the tracer holds extra references to
  build accurate traces
- `__repr__`/`__str__` are called extra times to fetch values for the
  trace (side effects run more than the code specifies)

## The tradeoff we already met

Primitives (numbers, strings, booleans) are rendered inline in stack
frames instead of as heap objects, "purposely to keep the display less
cluttered" - with a checkbox ("show strings and numbers as objects")
for the accurate model. Starting March 2026 that checkbox becomes a
*basic option*: the accurate model is being promoted, which supports
our tether decision (names point at matter; no invisible copying).
Their "show list-of-lists as 2D array" option is the same philosophy as
our scale rule: honest default, deliberate simplification as an
explicit, reversible choice.

## What we take

- The blackboard constraint is our lessons constraint: small,
  self-contained, few steps. Validation, not coincidence.
- Full state over print (our tape) is their founding theory of action.
- "Caveat: our recorder invokes repr() on values (capped facts), so
  Python Tutor's `__repr__`-side-effects warning applies to our tracer
  verbatim. But our tape stores repr strings, not object references -
  so refcounts and `__del__` timing are NOT perturbed by recording."

## What differentiates us (their doc, our reading)

- Embodied: 3D matter, chambers, pipes - they stay a flat blackboard
  imitation; the 2026 renderer work stays within that model.
- Manipulable: click-to-inspect at any frame, physics-based metaphors
  that carry semantics (bond strength, tethers).
- Collection is visible for us by design: untethered matter dissolving
  is the lesson about rebinding vs mutation vs collection - the exact
  events Python Tutor declares out of scope. Our differentiator is
  their documented blind spot.

## Open items from this reading

- Tape-size policy: we have no step limit yet; a loop over thousands
  of items would explode the tape. Python Tutor caps at ~100 steps.
  Decide our cap (and loop-collapse recording) before lesson 5.
- The crossed-arrows screenshot your advisor spotted: if confirmed,
  report through their Google Form (their doc requests reproducible
  bug reports with a permanent link).
