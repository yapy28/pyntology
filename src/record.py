#!/usr/bin/env python3
"""The tracer: run a small Python program and record what it did.

The tape is the complete, honest record of one real execution - the
program is never simulated or predicted, it runs, and the interpreter
reports every moment we care about (the event taxonomy):

  start / end            the experiment powers on and off (exit code)
  line                   which statement is about to run, its source
                         text, and the literals it brings into being
  assign                 a name was bound or rebound to a new value,
                         with the value as a capped fact
  call_enter/call_return a machine started (with the matter entering)
                         and finished (with the matter leaving)
  output                 matter observed through the microscope
                         (captured stdout, in order)
  exception              an alarm went off (raised; uncaught if the
                         experiment dies)

Values are recorded as capped facts {type, repr, len}: enough to
inspect any value at any frame, never more than the program itself
knew. The state at any moment is reconstructed by folding events - the
renderer never guesses.

The program REALLY RUNS. Feed it toy inputs only. The no-network rule
holds everywhere in this project: the tracer is a plain local process,
nothing leaves the machine.

Usage:
  .venv/bin/python src/record.py lessons/01_hello.py \
      --out web/tapes/01_hello.json
"""

import argparse
import ast
import io
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAP = 200


def cap_value(v):
    """A capped, JSON-safe fact about a value."""
    try:
        if isinstance(v, str):
            text = v if len(v) <= 60 else v[:57] + "..."
            return {"type": "str", "text": text, "len": len(v),
                    "repr": repr(text)}
        if isinstance(v, bool):
            return {"type": "bool", "repr": repr(v)}
        if isinstance(v, (int, float)):
            return {"type": type(v).__name__, "repr": repr(v)}
        if isinstance(v, (list, tuple, dict, set)):
            return {"type": type(v).__name__, "len": len(v),
                    "repr": repr(v)[:CAP]}
        return {"type": type(v).__name__, "repr": repr(v)[:CAP]}
    except Exception:
        return {"type": "unknown", "repr": "<unrepresentable>"}


def literals_by_line(tree):
    """Static matter: the constants each statement brings into existence.
    A literal's value is knowable without running anything - the recorder
    reads it straight off the AST so the renderer never has to parse
    Python."""
    consts = defaultdict(list)
    for node in ast.walk(tree):
        if (isinstance(node, ast.Constant)
                and isinstance(node.value, (str, int, float, bool))):
            consts[node.lineno].append(cap_value(node.value))
    return consts


def record(path: Path):
    source = path.read_text(encoding="utf-8")
    lines = source.splitlines()
    tree = ast.parse(source, filename=str(path))
    consts = literals_by_line(tree)

    events = []
    state = {"i": 0}

    def emit(kind, **data):
        events.append({"i": state["i"], "kind": kind, **data})
        state["i"] += 1

    stdout_buf = io.StringIO()
    flushed = [0]
    last_locals = {}   # id(frame) -> {name: capped fact}
    in_module = set()  # id(frame) for the module frame

    def flush_output():
        text = stdout_buf.getvalue()
        if len(text) > flushed[0]:
            emit("output", text=text[flushed[0]:])
            flushed[0] = len(text)

    def snapshot(frame):
        caps = {}
        for k, v in list(frame.f_locals.items()):
            if k.startswith("__"):
                continue
            caps[k] = cap_value(v)
        return caps

    def diff_assignments(frame):
        """Bindings made by the statement that just finished: the frame's
        locals, compared against the last time we looked."""
        prev = last_locals.get(id(frame))
        cur = snapshot(frame)
        last_locals[id(frame)] = cur
        if prev is None:
            return
        scope = "<module>" if id(frame) in in_module \
            else frame.f_code.co_name
        for name, fact in cur.items():
            if name not in prev or prev[name] != fact:
                emit("assign", name=name, value=fact, scope=scope)

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != str(path):
            return None  # only the experiment is recorded, not stdlib
        if event == "call":
            fname = frame.f_code.co_name
            args = {k: cap_value(v) for k, v in frame.f_locals.items()
                    if not k.startswith("__")}
            if fname == "<module>":
                in_module.add(id(frame))
                emit("call_enter", func="<module>", args={})
            else:
                emit("call_enter", func=fname, args=args)
            last_locals[id(frame)] = snapshot(frame)
            return tracer
        if event == "line":
            flush_output()
            diff_assignments(frame)
            lineno = frame.f_lineno
            code = lines[lineno - 1].strip() if lineno - 1 < len(lines) else ""
            emit("line", line=lineno, code=code,
                 consts=consts.get(lineno, []))
            return tracer
        if event == "return":
            flush_output()
            diff_assignments(frame)
            fname = frame.f_code.co_name
            emit("call_return", func=fname, value=cap_value(arg))
            return tracer
        if event == "exception":
            flush_output()
            emit("exception", exc=type(arg[1]).__name__,
                 text=str(arg[1])[:CAP])
            return tracer
        return tracer

    def wrapped_print(*args, sep=' ', end='\n', file=None, flush=False):
        # the tape must know that print is a function that was called:
        # its arguments in, its return value out
        emit("call_enter", func="print",
             args=[cap_value(a) for a in args])
        stdout_buf.write(sep.join(str(a) for a in args) + end)
        flush_output()
        emit("call_return", func="print", value=cap_value(None))

    code = compile(source, str(path), "exec")
    g = {"__name__": "__main__", "__builtins__": __builtins__}
    g["print"] = wrapped_print

    emit("start")
    old_trace, old_out = sys.gettrace(), sys.stdout
    sys.settrace(tracer)
    sys.stdout = stdout_buf
    exit_code = 0
    try:
        exec(code, g)  # the experiment really runs
    except SystemExit as exc:
        exit_code = exc.code if isinstance(exc.code, int) else 0
    except BaseException as exc:
        emit("exception", exc=type(exc).__name__, text=str(exc)[:CAP],
             uncaught=True)
        exit_code = 1
    finally:
        sys.settrace(old_trace)
        sys.stdout = old_out
    flush_output()
    emit("end", code=exit_code)

    return {
        "program": path.stem,
        "source": source,
        "lines": lines,
        "events": events,
        "stdout": stdout_buf.getvalue(),
        "python": sys.version.split()[0],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("program", type=Path, help="the program to record")
    ap.add_argument("--out", type=Path, default=None,
                    help="tape output path (default web/tapes/<stem>.json)")
    args = ap.parse_args()
    path = args.program
    if not path.is_absolute():
        path = (ROOT / path).resolve()
    tape = record(path)
    out = args.out or ROOT / "web" / "tapes" / f"{path.stem}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(__import__("json").dumps(tape, indent=1,
                                            ensure_ascii=False),
                   encoding="utf-8")
    kinds = defaultdict(int)
    for ev in tape["events"]:
        kinds[ev["kind"]] += 1
    print(f"tape -> {out.relative_to(ROOT)}")
    print(f"  events: {len(tape['events'])}  {dict(kinds)}")
    print(f"  stdout captured: {len(tape['stdout'])} chars, "
          f"exit code: {tape['events'][-1]['code']}")


if __name__ == "__main__":
    main()
