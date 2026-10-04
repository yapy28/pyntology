#!/usr/bin/env python3
"""Render docs/concepts.md from the CSV database.

The CSVs are the single source of truth (load them into Google Sheets
for the real work); this script regenerates the human-readable
documentation from them so the docs can never drift from the data.

Usage: python3 src/render_concepts.py   (after check_concepts.py passes)
"""

import csv
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

AREA_ORDER = [
    "program structure", "values and types", "variables", "output",
    "functions", "control flow", "collections", "errors", "files",
    "modules", "objects",
]


def load(name):
    with (DOCS / name).open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def md_escape(text):
    return text.replace("|", "\\|").replace("\n", " ")


def main():
    check = subprocess.run(
        [sys.executable, str(ROOT / "src" / "check_concepts.py")],
        capture_output=True, text=True)
    if check.returncode != 0:
        print(check.stdout)
        raise SystemExit("concept database invalid; fix it before rendering")

    concepts = load("concepts.csv")
    relations = load("relations.csv")

    out = []
    out.append("# The Python concept database")
    out.append("")
    out.append("Generated from `docs/concepts.csv` and `docs/relations.csv`")
    out.append("- edit the CSVs (or your Google Sheets), never this file;")
    out.append("regenerate with `python3 src/render_concepts.py`.")
    out.append("")
    out.append("The rules of the database:")
    out.append("")
    out.append("- Free text is allowed ONLY in `definition`, `example` and")
    out.append("  `shape`. Every other column is a controlled term.")
    out.append("- `possible_inputs` / `possible_outputs` are semicolon-separated")
    out.append("  concept ids: what can be plugged into this concept, and")
    out.append("  what comes out. The pluggability columns ARE the graph.")
    out.append("- `status` is `draft` until the user ratifies it. Panels may")
    out.append("  quote only `agreed` definitions verbatim; no shape may be")
    out.append("  built for a concept that is not `agreed`.")
    out.append("- Definitions are written in our own words, in documentation")
    out.append("  register, checked against python.org and w3schools.")
    out.append("")
    agreed = sum(1 for c in concepts if c["status"] == "agreed")
    out.append(f"**{len(concepts)} concepts ({agreed} agreed), "
               f"{len(relations)} relations.**")
    out.append("")

    by_area = {}
    for c in concepts:
        by_area.setdefault(c["area"], []).append(c)

    out.append("## Relations (the controlled vocabulary)")
    out.append("")
    out.append("| Relation | Definition | Example | Status |")
    out.append("|---|---|---|---|")
    for r in relations:
        out.append(f"| `{r['id']}` | {md_escape(r['definition'])} "
                   f"| `{md_escape(r['example'])}` | {r['status']} |")
    out.append("")

    for area in AREA_ORDER:
        rows = by_area.get(area)
        if not rows:
            continue
        out.append(f"## {area.capitalize()}")
        out.append("")
        out.append("| Id | Concept | Definition | Example | "
                   "Possible inputs | Possible outputs | Shape | Status |")
        out.append("|---|---|---|---|---|---|---|---|")
        for c in rows:
            out.append(
                f"| `{c['id']}` | {md_escape(c['concept'])} "
                f"| {md_escape(c['definition'])} "
                f"| `{md_escape(c['example'])}` "
                f"| {md_escape(c['possible_inputs'])} "
                f"| {md_escape(c['possible_outputs'])} "
                f"| {md_escape(c['shape'])} "
                f"| {c['status']} |")
        out.append("")

    (DOCS / "concepts.md").write_text("\n".join(out) + "\n",
                                      encoding="utf-8")
    print(f"rendered docs/concepts.md: {len(concepts)} concepts, "
          f"{len(relations)} relations, {agreed} agreed")


if __name__ == "__main__":
    main()
