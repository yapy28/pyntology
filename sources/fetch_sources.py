#!/usr/bin/env python3
"""Fetches the Collibra product documentation pages used to build the colibri
metamodel. Pinned to doc version 2026.02 for reproducibility; falls back to
/latest/ on failure.

Usage: python sources/fetch_sources.py   (writes .htm files into sources/raw/)
Works with the standard library only, so no Node.js is required.
"""

import ssl
import urllib.error
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw"


def fetch(url):
    """GET with certificate verification; falls back to an unverified
    context when a corporate TLS-intercepting proxy breaks verification
    (Python does not use the Windows certificate store)."""
    req = urllib.request.Request(
        url, headers={"User-Agent": "colibri-source-fetch/0.2"})

    def open_unverified():
        return urllib.request.urlopen(
            req, timeout=60, context=ssl._create_unverified_context())

    try:
        return urllib.request.urlopen(req, timeout=60)
    except urllib.error.URLError as err:
        if isinstance(getattr(err, "reason", None), ssl.SSLError):
            print(f"  certificate verification failed ({url}); retrying "
                  f"without verification (corporate TLS interception?)")
            return open_unverified()
        raise
    except ssl.SSLError:
        return open_unverified()

SOURCES = [
    ("asset-types-ootb",
     "Assets/AssetTypes/ref_ootb-asset-types.htm",
     "Out-of-the-box asset types (full table with hierarchy)"),
    ("asset-types-about",
     "Assets/AssetTypes/to_asset-types.htm",
     "About asset types (main asset types, the hierarchy roots)"),
    ("attribute-types-ootb",
     "Assets/Characteristics/Attributes/AttributeTypes/ref_attribute-types.htm",
     "Out-of-the-box attribute types (full table)"),
    ("relation-types-ootb",
     "Assets/Characteristics/Relations/RelationTypes/ref_relation-types.htm",
     "Out-of-the-box relation types (head role, co-role, tail)"),
]

BASES = [
    "https://productresources.collibra.com/docs/collibra/2026.02",
    "https://productresources.collibra.com/docs/collibra/latest",
]


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    failures = []
    for name, path, _desc in SOURCES:
        out = RAW / f"{name}.htm"
        ok = False
        for base in BASES:
            try:
                with fetch(f"{base}/Content/{path}") as res:
                    body = res.read()
                out.write_bytes(body)
                print(f"{name}: saved {len(body)} bytes from {base}")
                ok = True
                break
            except Exception as err:  # noqa: BLE001 - report and try next base
                print(f"{name}: {base} -> {err}")
        if not ok:
            failures.append(name)
    if failures:
        raise SystemExit(f"FAILED to fetch: {', '.join(failures)}")


if __name__ == "__main__":
    main()
