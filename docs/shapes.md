# The shape language

Pyntology renders a Python program as a laboratory experiment. The rule
that decides every shape: **matter from physics, motion from machinery.**
Values are physical things whose properties encode Python semantics; the
program is apparatus on a bench. If a shape carries no semantic truth of
Python, it is decoration and is rejected.

A second rule, learned the hard way in lesson 1: **no figurative
sculpture.** Apparatus is rendered as geometric glyphs plus labels, and
the metaphor lives in motion — beams, glides, pulses — never in a fake
instrument assembled from cylinders. A torus that behaves like a lens
reads; a "microscope" built from primitives reads as a statue with a
donut on a branch.

A third: **matter has a birthplace.** Values materialize at the
statement plate of the line that brings them into existence, then flow
through the story. Nothing appears out of thin air.

## The entry contract

No shape ships without a completed entry in this document. Every entry
has six fields:

0. **Scale** — behavior at 10 items and at 10,000 items, defined first.
   A metaphor that cannot collapse gracefully does not ship, no matter
   how beautiful it is at n=3.
1. **Semantics** — the Python truth the shape teaches.
2. **Visual spec** — geometry, material, color, motion.
3. **Interactions** — hover, click/inspect, crack open, scrub behavior.
4. **Why this shape** — the lie it avoids and the truth it encodes.
5. **Forced by lesson** — the first lesson that requires it (a shape is
   only built when a lesson demands it).

## Type colors

| Python type | Color |
|---|---|
| `str` | `#4cc9f0` (cyan) |
| `int` / `float` | `#ffd166` (gold) |
| `bool` | `#ff5d8f` (magenta) |
| `NoneType` | `#7c8f99` (gray) |

## Entries

### String — the helix

0. **Scale**: up to 40 characters, every character is a bead on the coil
   and the coil's length grows with the string. Beyond 40 the beads
   collapse away and the string renders as a coiled cable tagged with its
   length; the inspector always carries the first 60 characters.
1. **Semantics**: a string is a *sequence* of characters, one order,
   immutable. Length is a physical property.
2. **Visual spec**: a tube wound along a helical curve; character beads
   (white) sit at each character position; a floating tag carries the
   value.
3. **Interactions**: click to inspect (type, length, value at this
   frame). Future: slicing = cutting the coil at a rung.
4. **Why this shape**: an orb says "a string is a thing"; a helix says
   "a string is characters *in order*" — the rungs teach sequence
   without a word.
5. **Forced by**: lesson 1 (hello).

### Number — the orb

0. **Scale**: radius grows with magnitude (log scale), capped so a
   `10**100` orb does not eat the room.
1. **Semantics**: numbers are smooth, atomic matter; magnitude is
   physical size.
2. **Visual spec**: a smooth sphere, gold, radius `4 + min(8,
   log2(|value|+1) * 2)`.
3. **Interactions**: click to inspect value and type.
4. **Why this shape**: the periodic-table instinct — the simplest
   matter gets the simplest shape, so it reads as *primitive* next to
   structured matter (helices, lattices).
5. **Forced by**: lesson 1's scaffold; first exercised by lesson 2
   (pay).

### print — the observation ring and screen

0. **Scale**: the screen shows the first 9 lines of output, each capped
   at ~46 characters; the inspector carries everything captured so far.
1. **Semantics**: printing is *non-destructive observation*. The value
   passes through the ring and is projected onto a screen; the matter
   itself is never touched.
2. **Visual spec**: a glowing torus on a thin post, labeled `print` — a
   geometric glyph, explicitly NOT a figurative microscope. When a value
   passes through, a light cone fires ring → screen and the readout
   appears on the screen.
3. **Interactions**: click the screen to read everything observed up to
   the current frame; click the ring for what it does; click matter to
   confirm it is unchanged.
4. **Why this shape**: beginners believe `print(x)` *does something to*
   x. The projection says: observed, never transformed — the lesson
   lives in the motion, not in a caption or a sculpture.
5. **Forced by**: lesson 1 (hello).

### The statement plate

0. **Scale**: one plate per program showing the most recently executed
   line; later lessons grow one plate per function body.
1. **Semantics**: code is the recipe the experiment follows; the plate
   is *what is executing right now*.
2. **Visual spec**: a small dark plaque showing the line number and
   source text, standing at the head of the bench where matter is born.
3. **Interactions**: part of the bench inspection.
4. **Why this shape**: matter needs a birthplace — the helix materializes
   at the plate, so "this line created this value" is spatial, not
   implied.
5. **Forced by**: lesson 1 (hello).

### The program — the experiment bench

0. **Scale**: one bench per program, always. A lesson is one room.
1. **Semantics**: a program run is one experiment: it powers on
   (`start`), matter appears and moves, it powers off (`end`, exit code).
2. **Visual spec**: a dark pedestal with an accent power ring; the ring
   lights when the module loads, dims when the run ends; the program's
   name floats over the bench.
3. **Interactions**: click the bench to see program status (running /
   finished, exit code, interpreter version).
4. **Why this shape**: separates *the experiment* (this run) from *the
   matter and apparatus* (what it used) — the run is a place, not a
   thing.
5. **Forced by**: lesson 1 (hello).

## Planned entries (built only when a lesson forces them)

| Shape | Python concept | Forced by |
|---|---|---|
| tether | variable binding (name → value, a line of force; two tethers on one atom = aliasing) | lesson 2 (pay) |
| chamber | function: intake pipes per parameter, exhaust for return, its own interior bench | lesson 4 (computepay) |
| oscillating gate | for/while loops: pulses one item at a time, counter on the wheel, collapse modes | lesson 5 (min/max) |
| junction | if/elif/else: taken arm lights, untaken arms snap shut | lesson 3 (overtime) |
| alarm | exceptions: red pulse back along the pipe; catch = a net | lesson 5 (try/except) |
| tank | a file on disk, outside the wall; write = it fills and persists | lesson 7 (read a file) |
| molecule (breakable bonds) | list: append = bonding, sort = annealing the chain | lesson 8 (unique words) |
| molecule (covalent bonds) | tuple: immutable once bonded | lesson 10 (hour histogram) |
| crystal lattice with receptor sites | dict: keys dock into shaped receptors; get with default; iteration | lesson 9 (top email) |
| intake chute | stdin (`input()`): matter arrives from outside the lab | lesson 5 (min/max) |
| jar (sealed, beamed open) | import: a module's stock arriving into the lab | first import lesson |
