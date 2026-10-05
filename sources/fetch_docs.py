#!/usr/bin/env python3
"""Fetch the standing documentation library into sources/raw/.

This is what we read before writing ANY concept definition:

  1. The complete official Python documentation (HTML archive of
     docs.python.org - tutorial, language reference, library reference,
     glossary, everything), pinned to the current release.
  2. The w3schools Python tutorial pages (core language), fetched
     one page at a time.

sources/raw/ is gitignored: the library is local reading material, not
repo content. SOURCES.md in this folder is the manifest - what we read,
where it comes from, under what license.

Usage: python3 sources/fetch_docs.py
"""

import ssl
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = Path(__file__).resolve().parent / "raw"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) pyntology-docs/1.0"

DOCS_ARCHIVE = "https://docs.python.org/3/archives/python-3.14-docs-html.zip"
W3_BASE = "https://www.w3schools.com/python/"

W3SCHOOLS_PAGES = [
    # core language, in w3schools' own teaching order
    "python_intro.asp", "python_getstarted.asp", "python_syntax.asp",
    "python_output.asp", "python_comments.asp", "python_variables.asp",
    "python_datatypes.asp", "python_numbers.asp", "python_casting.asp",
    "python_strings.asp", "python_booleans.asp", "python_operators.asp",
    "python_lists.asp", "python_tuples.asp", "python_sets.asp",
    "python_dictionaries.asp", "python_if_else.asp", "python_match.asp",
    "python_while_loops.asp", "python_for_loops.asp", "python_functions.asp",
    "python_lambda.asp", "python_arrays.asp", "python_iterators.asp",
    "python_modules.asp", "python_datetime.asp", "python_math.asp",
    "python_json.asp", "python_regex.asp", "python_pip.asp",
    "python_try_except.asp", "python_string_formatting.asp",
    "python_none.asp", "python_user_input.asp", "python_virtualenv.asp",
    # objects and classes (slugs as w3schools actually names them)
    "python_classes.asp", "python_class_init.asp", "python_class_self.asp",
    "python_class_properties.asp", "python_class_methods.asp",
    "python_magic_methods.asp", "python_inheritance.asp",
    "python_polymorphism.asp", "python_encapsulation.asp",
    "python_class_inner.asp",
    # file handling
    "python_file_handling.asp", "python_file_open.asp",
    "python_file_write.asp", "python_file_remove.asp",
]


def fetch(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": UA})

    def open_unverified():
        return urllib.request.urlopen(
            req, timeout=120, context=ssl._create_unverified_context())

    try:
        data = urllib.request.urlopen(req, timeout=120).read()
    except ssl.SSLError:
        data = open_unverified().read()
    except urllib.error.HTTPError as err:
        print(f"  HTTP {err.code} {url}")
        return False
    except Exception as err:
        print(f"  FAILED {url}: {err}")
        return False
    dest.write_bytes(data)
    return True


def main():
    RAW.mkdir(parents=True, exist_ok=True)

    # 1. the complete official documentation archive
    zpath = RAW / "python-docs.zip"
    print(f"fetching the official docs archive...")
    if not fetch(DOCS_ARCHIVE, zpath):
        print("could not fetch the archive; aborting")
        return 1
    print(f"  archive: {zpath.stat().st_size / 1e6:.0f} MB")
    docs_dir = RAW / "python-docs"
    if not docs_dir.exists():
        print("  extracting...")
        with zipfile.ZipFile(zpath) as zf:
            names = zf.namelist()
            top = {n.split("/")[0] for n in names if "/" in n}
            zf.extractall(docs_dir)
        print(f"  extracted {len(names)} files -> {docs_dir}")

    # 2. the w3schools core-language tutorial pages
    w3dir = RAW / "w3schools"
    w3dir.mkdir(parents=True, exist_ok=True)
    ok = missing = 0
    print(f"fetching {len(W3SCHOOLS_PAGES)} w3schools pages...")
    for slug in W3SCHOOLS_PAGES:
        dest = w3dir / slug
        if dest.exists() and dest.stat().st_size > 1000:
            ok += 1
            continue
        if fetch(W3_BASE + slug, dest):
            ok += 1
        else:
            missing += 1
            if dest.exists():
                dest.unlink()
    print(f"  w3schools: {ok} pages present, {missing} missing (404s "
          f"are reported above; slugs shift as w3schools reorganizes)")

    # 3. prior art: the Python Tutor design doc (its public "docs,
    #    unsupported features, and FAQ" document)
    pa = RAW / "prior-art"
    pa.mkdir(parents=True, exist_ok=True)
    okpa = 0
    for name, url in [
        ("pythontutor-design.txt",
         "https://docs.google.com/document/d/"
         "13_Bc-l2FKMgwPx4dZb0sv7eMfYMHhRVgBRShha8kgbU/export?format=txt"),
        ("pythontutor-landing.html", "https://pythontutor.com/"),
    ]:
        dest = pa / name
        if not dest.exists() or dest.stat().st_size < 500:
            okpa += 1 if fetch(url, dest) else 0
        else:
            okpa += 1
    print(f"  prior art: {okpa}/2 documents present")

    print("library ready under sources/raw/ - read before every definition")
    return 0


if __name__ == "__main__":
    sys.exit(main())
