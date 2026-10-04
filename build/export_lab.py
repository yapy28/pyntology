#!/usr/bin/env python3
"""Export a lab page as one self-contained HTML file.

Bundles web/lab.html, lab.js, the tape (as window.PYNT_TAPE), the logo
assets and three.js (fetched from unpkg at export time) into a single
file that opens directly from disk - no server, no network needed at
view time, honoring the project's no-network rule.

Usage:
  python3 build/export_lab.py lessons/01_hello --tape web/tapes/01_hello.json \\
      --out dist/01-hello.html
"""

import argparse
import base64
import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
PAGE = WEB / "lab.html"
THREE_URL = "https://unpkg.com/three@0.160.0/build/three.min.js"


def fetch_url(url: str) -> str:
    req = urllib.request.Request(url,
                                 headers={"User-Agent": "pyntology-lab/0.1"})

    def open_unverified():
        return urllib.request.urlopen(
            req, timeout=60, context=ssl._create_unverified_context())

    try:
        return urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    except ssl.SSLError:
        return open_unverified().read().decode("utf-8")


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("lesson", help="display name of the lesson")
    ap.add_argument("--tape", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    tape_text = args.tape.read_text(encoding="utf-8")
    # parse to guarantee the tape is valid JSON before shipping it
    tape = json.loads(tape_text)

    html = PAGE.read_text(encoding="utf-8")
    html = html.replace("<title>Pyntology lab</title>",
                        f"<title>Pyntology lab — {args.lesson}</title>")

    tags = re.findall(r'<script src="([^"]+)"></script>', html)
    for src in tags:
        if src.startswith("http"):
            if "three" not in src:
                raise SystemExit(f"unknown CDN script: {src}")
            blob = fetch_url(THREE_URL)
        else:
            local = PAGE.parent / src
            if not local.is_file():
                raise SystemExit(f"missing local script: {local}")
            blob = local.read_text(encoding="utf-8")
        if "</script" in blob:
            raise SystemExit(f"cannot inline {src}")
        html = html.replace(f'<script src="{src}"></script>',
                            f"<script>\n{blob}\n</script>", 1)

    # the tape rides inside the page: window.PYNT_TAPE is the tape text
    tape_js = json.dumps(tape_text, ensure_ascii=False)
    first = html.find("<script>")
    html = (html[:first]
            + f"<script>window.PYNT_TAPE = {tape_js};</script>\n"
            + html[first:])

    for src in set(re.findall(r'(?:src|href)="(assets/[^"]+)"', html)):
        path = PAGE.parent / src
        if not path.is_file():
            raise SystemExit(f"missing asset: {path}")
        mime = "image/png" if src.endswith(".png") else "application/octet-stream"
        html = html.replace(f'src="{src}"', f'src="{data_uri(path, mime)}"')
        html = html.replace(f'href="{src}"', f'href="{data_uri(path, mime)}"')

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html, encoding="utf-8")
    size_mb = args.out.stat().st_size / 1e6
    print(f"standalone lab: {args.out} ({size_mb:.1f} MB, "
          f"{len(tape['events'])} events, program {tape['program']})")
    print("open it directly in a browser - no server, no network")
    return 0


if __name__ == "__main__":
    sys.exit(main())
