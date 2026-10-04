# The Python concept database

Generated from `docs/concepts.csv` and `docs/relations.csv`
- edit the CSVs (or your Google Sheets), never this file;
regenerate with `python3 src/render_concepts.py`.

The rules of the database:

- `id` is a stable, readable slug - never a number. It is
  what other rows reference; `concept` is the display label
  (the rdfs:label pattern: two jobs, similar strings).
- Free text is allowed ONLY in `definition`, `example` and
  `shape`. Every other column is a controlled term.
- `possible_inputs` / `possible_outputs` are semicolon-separated
  concept ids: what can be plugged into this concept, and
  what comes out. The pluggability columns ARE the graph.
- `status` is `draft` until the user ratifies it. Panels may
  quote only `agreed` definitions verbatim; no shape may be
  built for a concept that is not `agreed`.
- Definitions are written in our own words, in documentation
  register, checked against python.org and w3schools.

**30 concepts (0 agreed), 9 relations.**

## Relations (the controlled vocabulary)

| Relation | Definition | Example | Status |
|---|---|---|---|
| `contains` | A has B as a part. | `a program contains statements` | draft |
| `creates` | A brings B into existence. | `a statement creates values` | draft |
| `binds` | A attaches a name to B. | `assignment binds a name to a value` | draft |
| `calls` | A starts B's execution. | `a statement calls a function` | draft |
| `receives` | A takes B in. | `a parameter receives an argument's value` | draft |
| `returns` | A gives B back to its caller. | `a function returns a value` | draft |
| `writes` | A puts B into a destination. | `print writes text to stdout` | draft |
| `converts` | A turns B into another type. | `casting converts a value` | draft |
| `observes` | A reads B without changing it. | `print observes its arguments` | draft |

## Program structure

| Id | Concept | Definition | Example | Possible inputs | Possible outputs | Shape | Status |
|---|---|---|---|---|---|---|---|
| `program` | Program | A file of Python code. Python runs it top to bottom, one statement at a time. | `print("Hello, world!")` |  | stdout | the room: the boxes exist in it in reading order | draft |
| `module` | Module | A .py file containing definitions and statements. A program is a module run directly. | `python3 lessons/01_hello.py` |  |  | the floor of the room; click it for the run's facts | draft |
| `statement` | Statement | An instruction. Usually one line; executed one by one, in the order written. | `x = 5` |  | value | box with the code on its face; the working box glows | draft |
| `block` | Block | A group of statements at the same indentation level. Indentation is syntax, not style. | `if x > 2:     print("yes")` |  |  | no shape yet; forced by lesson 3 | draft |
| `comment` | Comment | Text after #. Python ignores it completely; it never runs. | `# this never runs` |  |  | no shape: never executes never appears | draft |
| `expression` | Expression | Code that produces a value. | `2 + 3` | value | value | the ball that appears where the expression's line runs | draft |
| `line` | Line | A physical line of the file. A statement usually ends when the line ends. | `` |  |  | the position of a box in the reading-order row | draft |

## Values and types

| Id | Concept | Definition | Example | Possible inputs | Possible outputs | Shape | Status |
|---|---|---|---|---|---|---|---|
| `value` | Value | A piece of data. Every value has exactly one type. | `"Hello, world!"` |  |  | ball; color by type | draft |
| `type` | Type | The kind of a value. It determines what the value can do. | `type(42)` | value |  | the ball's color and form | draft |
| `str` | str | Text: an ordered sequence of characters. Immutable: it can never change after creation. | `"Hello, world!"` |  |  | ball in the str color | draft |
| `int` | int | A whole number, of unlimited size. | `42` |  |  | ball in the int color | draft |
| `float` | float | A number with a decimal point. | `3.14` |  |  | ball in the float color | draft |
| `bool` | bool | True or False. The type of every comparison. | `5 > 2` |  |  | ball in the bool color | draft |
| `none` | None | The absence of a value. What a function returns when it does not return anything. | `None` |  |  | gray wisp from the chamber's exhaust; dissolves | draft |
| `literal` | Literal | A value written directly in the code: "hello", 42, True, None. | `print("Hello, world!")` |  | value | the ball is born where its line runs | draft |
| `casting` | Casting | Converting a value to another type: int("42"), str(3.14), float(1). | `int("42")` | value | value | the ball changes color passing through a conversion chamber | draft |

## Variables

| Id | Concept | Definition | Example | Possible inputs | Possible outputs | Shape | Status |
|---|---|---|---|---|---|---|---|
| `name` | Name (variable) | A label bound to a value. Names point at values; the value is not copied. | `x = 5` | value |  | a tether from the label to the ball | draft |
| `assignment` | Assignment | The statement binding a name to a value. | `x = 5` | value | name | the tether attaches | draft |
| `reassignment` | Re-assignment | Binding a name to a new value. The old value is unaffected. | `x = 6` | value | name | the tether re-aims at a new ball | draft |

## Output

| Id | Concept | Definition | Example | Possible inputs | Possible outputs | Shape | Status |
|---|---|---|---|---|---|---|---|
| `stdout` | stdout | The standard output stream: where print writes text. | `` |  |  | the wall; lines accumulate one strip per print | draft |
| `print` | print | The builtin function that writes its arguments to stdout as text. It does not modify its arguments, and returns None. | `print("Hello, world!")` | value | stdout;none | chamber: materializes when called; the argument drops through the aperture; a None wisp leaves the exhaust; projects to the wall | draft |
| `str_rendering` | str() rendering | What print writes is str(value): the value's string representation, not the value itself. | `print(42) writes "42"` | value | str | the glowing text on the wall strip | draft |

## Functions

| Id | Concept | Definition | Example | Possible inputs | Possible outputs | Shape | Status |
|---|---|---|---|---|---|---|---|
| `function` | Function | A block of code which only runs when it is called. A function can return data as a result. | `def pay(hrs): ... ` | value | value | chamber | draft |
| `def` | def | The statement that creates a function and binds it to a name. The body does not run yet. | `def pay(hrs): ... ` |  | function;name | the chamber exists empty and waiting | draft |
| `call` | Call | Runs the function's block, giving it arguments; the call produces the function's return value. | `pay(40)` | function;value | value | the chamber materializes and works | draft |
| `parameter` | Parameter | A name inside the function that receives an argument's value. | `def pay(hrs) ` | value | name | the intake aperture of the chamber | draft |
| `argument` | Argument | A value given to a function in a call. | `pay(40)` | value | value | the ball entering the aperture | draft |
| `return` | return | The statement that ends the function and produces its return value. | `return pay` |  | value | the exhaust emits | draft |
| `return_value` | Return value | The data a call produces. If the function does not return anything, the value is None. | `p = pay(40)` |  | value | what exits the exhaust: a ball or the None wisp | draft |
| `scope` | Scope | Where a name is visible: local inside a function, global in the module. | `` | name |  | where tethers may attach: inside the chamber or on the floor | draft |

