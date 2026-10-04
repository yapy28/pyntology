# The documentation library

What we read before writing any concept definition. Fetch with:

```bash
python3 sources/fetch_docs.py     # -> sources/raw/ (gitignored, local only)
```

## Contents

| Source | What | Where it lands |
|---|---|---|
| docs.python.org | The complete official Python documentation for the current release (3.14): tutorial, language reference, library reference, glossary, HOWTOs - one pinned HTML archive | `sources/raw/python-docs/` |
| w3schools.com | The core-language Python tutorial pages, in their teaching order (syntax, output, comments, variables, data types, ... functions, classes, file handling) | `sources/raw/w3schools/` |

## The procedure

1. Before writing or amending any `definition` in
   `docs/concepts.csv`, read the corresponding section of the official
   documentation here - the tutorial, the reference, or the glossary.
2. Write our own words in documentation register. Never copy verbatim.
3. w3schools is the second reading: it shows the teaching order and
   the beginner's register, but python.org is the authority.
4. The `source` column in concepts.csv records the exact URL that
   backs each definition.

## Licenses

- The Python documentation is maintained by the Python Software
  Foundation under the PSF License Agreement. Fetched for reference;
  our database quotes nothing verbatim.
- w3schools content is copyrighted by Refsnes Data. Fetched strictly
  for local private reference - never copied into the repo, never
  committed, never redistributed.
