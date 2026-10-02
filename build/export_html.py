#!/usr/bin/env python3
"""Export a visualization page as one self-contained HTML file.

Bundles the page (default web/index.html), its local scripts, the graph
payload, logo assets and the needed libraries (fetched from unpkg at
export time: 3d-force-graph and/or three.js, whichever the page references)
into a single file that opens directly from disk - no server, no network.

Run build.py first, then:
  python build/export_html.py                              # the main viewer
  python build/export_html.py --page web/onion.html \\
      --out dist/pyntology-onion.html                      # the onion renderer
"""

import argparse
import base64
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DEFAULT_PAGE = WEB / "index.html"
DEFAULT_GRAPH = WEB / "graph.json"
DEFAULT_OUT = ROOT / "dist" / "colibri.html"
LIB_URL = "https://unpkg.com/3d-force-graph"
THREE_URL = "https://unpkg.com/three@0.160.0/build/three.min.js"


def fetch_url(url: str) -> str:
    """GET with certificate verification; falls back to an unverified
    context when a corporate TLS-intercepting proxy breaks verification."""
    req = urllib.request.Request(url,
                                 headers={"User-Agent": "colibri-export/0.1"})

    def open_unverified():
        return urllib.request.urlopen(
            req, timeout=60, context=ssl._create_unverified_context())

    try:
        return urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    except urllib.error.URLError as err:
        if isinstance(getattr(err, "reason", None), ssl.SSLError):
            print(f"certificate verification failed ({url}); retrying "
                  f"without verification (corporate TLS interception?)")
            return open_unverified().read().decode("utf-8")
        raise
    except ssl.SSLError:
        return open_unverified().read().decode("utf-8")


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--page", default=str(DEFAULT_PAGE),
                    help="page to export (default: web/index.html)")
    ap.add_argument("--graph", default=str(DEFAULT_GRAPH),
                    help="graph payload to embed (default: web/graph.json)")
    ap.add_argument("--out", default=str(DEFAULT_OUT),
                    help="output HTML file (default: dist/colibri.html)")
    args = ap.parse_args()
    page = Path(args.page)
    out_path = Path(args.out)
    graph_path = Path(args.graph)

    if not page.is_file():
        raise SystemExit(f"missing page: {page}")
    if not graph_path.is_file():
        raise SystemExit(f"missing {graph_path} - run build.py first")

    graph = graph_path.read_text(encoding="utf-8")
    # '<\/' is a valid JSON escape and prevents premature </script> parsing
    graph_safe = graph.replace("</", "<\\/")

    html = page.read_text(encoding="utf-8")

    # inline every script tag: local files read from disk, known CDNs fetched
    tags = re.findall(r'<script src="([^"]+)"></script>', html)
    inlined_blobs = 0
    for src in tags:
        if src.startswith("http"):
            if "3d-force-graph" in src:
                blob = fetch_url(LIB_URL)
            elif "three" in src:
                blob = fetch_url(THREE_URL)
            else:
                raise SystemExit(f"unknown CDN script: {src}")
        else:
            local = page.parent / src
            if not local.is_file():
                raise SystemExit(f"missing local script: {local}")
            blob = local.read_text(encoding="utf-8")
        if "</script" in blob:
            raise SystemExit(f"cannot inline {src}: contains '</script'")
        html = html.replace(f'<script src="{src}"></script>',
                           f"<script>\n{blob}\n</script>", 1)
        inlined_blobs += 1

    # inject the graph data before the first script
    first = html.find("<script>")
    html = (html[:first]
            + f"<script>window.COLOBRI_GRAPH = {graph_safe};</script>\n"
            + html[first:])

    # inline local images as data URIs
    for src in set(re.findall(r'(?:src|href)="(assets/[^"]+)"', html)):
        path = page.parent / src
        if not path.is_file():
            raise SystemExit(f"missing asset: {path}")
        mime = "image/png" if src.endswith(".png") else "application/octet-stream"
        html = html.replace(f'src="{src}"', f'src="{data_uri(path, mime)}"')
        html = html.replace(f'href="{src}"', f'href="{data_uri(path, mime)}"')

    # sanity: nothing external should remain
    leftovers = [m for m in ('src="http', 'src="assets', 'href="assets')
                 if m in html]
    if leftovers:
        raise SystemExit(f"external references remain: {leftovers}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    size_mb = out_path.stat().st_size / 1e6

    graph_data = json.loads(graph)
    print(f"standalone export: {out_path} "
          f"({size_mb:.1f} MB, {len(graph_data.get('nodes', []))} nodes, "
          f"{inlined_blobs} scripts inlined)")
    print("open it directly in a browser - no server needed")


if __name__ == "__main__":
    sys.exit(main())
