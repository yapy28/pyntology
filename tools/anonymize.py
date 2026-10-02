#!/usr/bin/env python3
"""Bulk anonymization for RDF files: search-and-replace across a folder.

Given a mapping file (JSON object: original string -> replacement), scans
every RDF file in a folder (recursively) and reports what would be replaced.
Only with --write does it modify the files in place.

Usage:
  python tools/anonymize.py <folder> --map mymap.json            # dry run
  python tools/anonymize.py <folder> --map mymap.json --write    # apply
  python tools/anonymize.py <folder> --map mymap.json --ignore-case

The mapping file contains the real names — never commit it. The default
convention tools/anonymize-map.json is gitignored; keep the real map there
or outside the repository.

Replacements are plain substring replacements (so they cover IRIs, prefixes,
literals and comments alike), applied in the order given in the map. Use
--ignore-case to catch different capitalizations. Files are rewritten
byte-for-byte except for the replacements (line endings preserved).
"""

import argparse
import json
import re
import sys
from pathlib import Path

SUFFIXES = {".ttl", ".owl", ".rdf", ".nt", ".n3", ".jsonld"}


def load_map(path: Path):
    try:
        m = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise SystemExit(f"map file is not valid JSON: {err}")
    if not isinstance(m, dict) or not m:
        raise SystemExit("map file must be a non-empty JSON object "
                         '{ "original": "replacement", ... }')
    bad = [k for k in m if not k]
    if bad:
        raise SystemExit("map contains empty search strings")
    return list(m.items())


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("folder", help="folder to scan recursively")
    ap.add_argument("--map", required=True, help="JSON mapping file")
    ap.add_argument("--write", action="store_true",
                    help="apply the replacements (default: dry run)")
    ap.add_argument("--ignore-case", action="store_true",
                    help="match the search strings case-insensitively")
    ap.add_argument("--suffixes", nargs="*", default=None,
                    help="file suffixes to scan (default: "
                         ".ttl .owl .rdf .nt .n3 .jsonld)")
    args = ap.parse_args()

    folder = Path(args.folder)
    if not folder.is_dir():
        raise SystemExit(f"not a folder: {folder}")
    map_path = Path(args.map)
    if not map_path.is_file():
        raise SystemExit(f"map file not found: {map_path}")
    mappings = load_map(map_path)
    suffixes = set(args.suffixes) if args.suffixes else SUFFIXES

    files = sorted(p for p in folder.rglob("*")
                   if p.is_file() and p.suffix.lower() in suffixes)
    if not files:
        raise SystemExit(f"no RDF files found under {folder}")

    total = {old: 0 for old, _ in mappings}
    files_changed, files_skipped, decode_failures = 0, 0, []

    print(f"{'WRITE' if args.write else 'DRY RUN'}: {len(files)} files, "
          f"{len(mappings)} mappings")
    for f in files:
        try:
            text = f.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            decode_failures.append(f)
            continue
        new_text = text
        hits = []
        for old, new in mappings:
            if args.ignore_case:
                pat = re.compile(re.escape(old), re.IGNORECASE)
                n = len(pat.findall(new_text))
                if n:
                    new_text = pat.sub(new, new_text)
            else:
                n = new_text.count(old)
                if n:
                    new_text = new_text.replace(old, new)
            if n:
                hits.append(f"{n}x {old!r}")
                total[old] += n
        if hits:
            files_changed += 1
            rel = f.relative_to(folder)
            print(f"  {rel}: {', '.join(hits)}")
            if args.write:
                f.write_bytes(new_text.encode("utf-8"))
        else:
            files_skipped += 1

    print(f"\nfiles with hits: {files_changed}, clean: {files_skipped}, "
          f"undecodable (skipped): {len(decode_failures)}")
    for old, n in sorted(total.items(), key=lambda kv: -kv[1]):
        print(f"  {n:5d}x {old!r}")
    if decode_failures:
        print("WARN could not decode as UTF-8 (left untouched):")
        for f in decode_failures[:5]:
            print(f"  {f}")

    if args.write:
        # verification pass: anything left?
        leaks = 0
        for f in files:
            try:
                text = f.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                continue
            for old, _ in mappings:
                if args.ignore_case:
                    n = len(re.findall(re.escape(old), text, re.IGNORECASE))
                else:
                    n = text.count(old)
                leaks += n
        if leaks:
            print(f"\nWARN: {leaks} occurrence(s) still remain after writing "
                  "(overlapping replacements?)")
            sys.exit(1)
        print("\nverification: no occurrences remain")
    else:
        print("\ndry run: nothing written (pass --write to apply)")


if __name__ == "__main__":
    main()
