Python Visualise: Design Notes

# Core Concept

A web application that visualises running Python programs so learners can see what code is doing, not just read it. The goal is to build real understanding of Python fundamentals (not just calling libraries), by pairing each concept in a standard curriculum (W3Schools Python tutorial order) with a clear visual.

# Two Possible Products

- Visualiser (PRIMARY, build first): write real Python, watch it run and animate. Builds intuition about what is happening underneath.
- Visual builder (PARKED for later): drag-and-drop blocks that generate code, Scratch-style. Risk: learners could avoid learning real syntax, which undercuts the goal. Park it and nail the visualiser first.

# Technical Approach

- Run the real program through a tracer (sys.settrace or the trace module) to capture every executed line, in order, plus the call stack at each step.
- Feed that event stream to a front-end renderer that draws the visual primitives and animates state changes.
- Python is not inherently recursive. Loops are plain iteration. What stacks up is the call stack of frames from function calls. The tracer captures both the same way.
- Platform: web app (desktop and mobile browsers, no install friction).
- Execution model still open: server-side (controlled and sandboxed, costs server resources) vs Pyodide (Python in the browser via WebAssembly, uses the user's device). Either works for small learning programs.
- V1 scope: small, deliberately simple programs and sample data (e.g. CSVs capped around 10 rows) so every trace step can be drawn without summarising or skipping. Handling large data and huge loops gracefully is a later problem.

# Visual Primitives

## 1. The Box (state: variables and values)

- A rectangle with a label on top (the variable name) and the current value inside.
- The label is simply whatever name the programmer chose in the code (x, message, greeting). It is NOT special Python syntax, and lessons must say so explicitly so beginners do not think they have to type a particular name.
- Everyday analogy: a labelled storage box in a closet. Different things need different box sizes, which quietly primes data types: small simple boxes for simple values, bigger compartmentalised boxes for lists and objects.
- Later use: two labels pointing at the same box, to show references vs copies (a classic beginner confusion).

## 2. The Machine (behaviour: functions)

- Common chassis: a funnel on one side (input), a spout on the other (output), a body in the middle where the work happens. The shared silhouette says "function" at a glance.
- The internals of the body change by what the function does (one silhouette, swappable guts):

  - Destructive or reducing (e.g. filtering a list): wood-chipper blades.
  - Combining or aggregating (e.g. sum, join): sausage or mincer grinding mechanism.
  - Duplicating (e.g. repeating an action): photocopier or stamping press.
  - Reordering (e.g. sort): sorting conveyor belt or rollers.
  - Pass-through (e.g. print): funnel straight to spout with nothing inside, showing it does not transform data, it just outputs it.
- Theme decision: industrial or factory machinery, chosen over a kitchen-appliance theme for consistency.

## 3. The Console / Screen (output)

- A fixed panel, like a terminal, where printed output lands and accumulates as a scrollable log.
- Also the familiar anchor for the very first lesson: this is a screen, results show up here (text, numbers, tables, images, and so on).

# Lesson Zero: Primitives Glossary (no real code yet)

Before any program appears, introduce each primitive on its own using everyday analogies, so nobody pattern-matches on a sample variable name or mistakes it for syntax.

1. The screen: the familiar anchor. This is where results appear.
2. The box, empty: holds a value, and the label is its name. Use the closet-box analogy, including that boxes come in different sizes.
3. The box, filled: this is what a value looks like inside it.
4. The machine: idle, then with something passing straight through. This represents an action happening to data.
5. The console with a line appearing: this is where results get displayed.

Only then does Lesson One introduce real code, e.g. print("hello world"), combining primitives the learner already understands.

# Curriculum Order (W3Schools Python tutorial)

Introduction, Variables, Data Types, Numbers and Casting, Strings, Booleans and Operators, Lists, Tuples, Sets, Dictionaries, If/Else, Loops, Functions, Classes and Objects, Modules, then onward (files, exceptions, and so on).

### Initial mapping of concepts to visuals

- Variables, data types, numbers, strings, booleans: the Box (with size hinting at complexity).
- Operators: small transformations applied to boxes.
- Lists, tuples, sets, dictionaries: containers of boxes.
- Loops: a repeating playhead highlighting the executing line, with a counter.
- Functions: the Machine.
- Call stack: stacking cards that grow on call and pop on return.
- Classes and objects: crates with labelled compartments (the original pipes-and-crates idea fits best here).

# Inspiration

Brilliant.org style: a truck moving through a grid while the matching line of code is highlighted, giving tight code-to-visual sync. The goal here is a general engine where the visual rules are defined once per concept and any Python program can be fed in.

# Parked Ideas / To-Do List

- Decide server-side vs Pyodide execution.
- Define visuals for if/else, loops and the call stack.
- Design the actual Lesson One sequence (print and variables) with the finalised primitives.
- Explore more machine-internals variants as new function categories come up.
- Eventually revisit the parked visual builder as a separate playground.
- Lesson Two CONFIRMED: data types shown inside the Box, no int/float/string-type labels yet, just "numbers" as one category (ints, floats, etc. all plain, right-aligned, same style). Strings keep quote marks in the box. Booleans shown as plain text True/False, same style as numbers (no icon). Printing any of these through the pass-through machine shows the value as Python's print would: numbers as-is, strings with quotes stripped, booleans as True/False.
- PARKED: the str() vs repr() distinction (why typing a variable name in the interactive shell, or using repr(), shows quotes around strings, while print() does not). Confusing for beginners if introduced too early; revisit as its own later lesson once the basic box and print model is second nature.
- PARKED: flip-switch visual for booleans at the machine level (comparison/conditional operators), not on the box itself. The box stays plain text True/False like other values; the switch metaphor may suit if/else or comparison machines later.
