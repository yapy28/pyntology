#!/usr/bin/env python3
"""Validate the concept database: the controlled-vocabulary cop.

Rules enforced (the user's no-free-text rule, machine-checked):
  - concepts.csv and relations.csv exist with exactly the right columns
  - concept ids are unique, snake_case
  - area comes from the fixed area vocabulary
  - status is draft or agreed
  - every possible_inputs / possible_outputs entry is an existing
    concept id (semicolon-separated; empty allowed) - no free text
  - relation ids are unique and snake_case

Free text is allowed ONLY in definition, example and shape. This script
fails loudly on any violation; run it before committing the CSVs.

Usage: python3 src/check_concepts.py
"""

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

CONCEPT_COLUMNS = ["id", "area", "concept", "definition", "example",
                   "possible_inputs", "possible_outputs", "contains", "shape", "status"]
RELATION_COLUMNS = ["id", "relation", "definition", "example", "status"]
AREAS = {
    "program structure", "values and types", "variables", "output",
    "input", "functions", "control flow", "collections", "errors", "files",
    "modules", "objects",
}
STATUSES = {"draft", "agreed"}
ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def fail(errors, msg):
    errors.append(msg)


def main():
    errors = []

    cpath = DOCS / "concepts.csv"
    rpath = DOCS / "relations.csv"
    for p in (cpath, rpath):
        if not p.is_file():
            return fail_and_exit([f"missing {p.relative_to(ROOT)}"])

    with cpath.open(encoding="utf-8") as f:
        concepts = list(csv.DictReader(f))
    with rpath.open(encoding="utf-8") as f:
        relations = list(csv.DictReader(f))

    if concepts and list(concepts[0].keys()) != CONCEPT_COLUMNS:
        fail(errors, f"concepts.csv columns must be exactly: {CONCEPT_COLUMNS}")
    if relations and list(relations[0].keys()) != RELATION_COLUMNS:
        fail(errors, f"relations.csv columns must be exactly: {RELATION_COLUMNS}")
    if errors:
        return fail_and_exit(errors)

    ids = set()
    for row in concepts:
        cid = row["id"]
        if not ID_RE.match(cid):
            fail(errors, f"concept id {cid!r}: must be snake_case")
        if cid in ids:
            fail(errors, f"concept id {cid!r}: duplicate")
        ids.add(cid)
        if row["area"] not in AREAS:
            fail(errors, f"{cid}: area {row['area']!r} not in the fixed vocabulary")
        if row["status"] not in STATUSES:
            fail(errors, f"{cid}: status {row['status']!r} must be draft or agreed")
        for col in ("possible_inputs", "possible_outputs", "contains"):
            for ref in (t.strip() for t in row[col].split(";") if t.strip()):
                if ref not in ids and ref not in {r["id"] for r in relations}:
                    # ids are being built as we go; recheck at the end
                    pass
        if not row["definition"].strip():
            fail(errors, f"{cid}: definition is required (free text allowed)")

    # recheck references now that all ids are known
    for row in concepts:
        for col in ("possible_inputs", "possible_outputs", "contains"):
            for ref in (t.strip() for t in row[col].split(";") if t.strip()):
                if ref not in ids:
                    fail(errors, f"{row['id']}: {col} references {ref!r}, "
                                  f"which is not a concept id")

    rids = set()
    for row in relations:
        rid = row["id"]
        if not ID_RE.match(rid):
            fail(errors, f"relation id {rid!r}: must be snake_case")
        if rid in rids:
            fail(errors, f"relation id {rid!r}: duplicate")
        rids.add(rid)
        if row["status"] not in STATUSES:
            fail(errors, f"relation {rid}: status must be draft or agreed")

    if errors:
        return fail_and_exit(errors)

    agreed = sum(1 for r in concepts if r["status"] == "agreed")
    print(f"concept database valid: {len(concepts)} concepts "
          f"({agreed} agreed), {len(relations)} relations")
    return 0


def fail_and_exit(errors):
    print("concept database INVALID:")
    for e in errors:
        print(f"  FAIL {e}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
