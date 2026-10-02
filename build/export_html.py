#!/usr/bin/env python3
"""Export the visualization as one self-contained HTML file.

Bundles web/index.html, web/app.js, web/graph.json, the logo assets and the
3d-force-graph library (fetched from unpkg at export time) into a single
file that opens directly from disk in any browser - no server, no network.

Run build.py first, then:
  python build/export_html.py
Output: dist/colibri.html
"""

import argparse
import base64
import json
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
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


def fetch_lib() -> str:
    return fetch_url(LIB_URL)


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--graph", default=str(DEFAULT_GRAPH),
                    help="graph payload to embed (default: web/graph.json)")
    ap.add_argument("--out", default=str(DEFAULT_OUT),
                    help="output HTML file (default: dist/colibri.html)")
    args = ap.parse_args()
    out_path = Path(args.out)

    for name in ("app.js", "index.html"):
        if not (WEB / name).is_file():
            raise SystemExit(f"missing {WEB / name}")
    graph_path = Path(args.graph)
    if not graph_path.is_file():
        raise SystemExit(f"missing {graph_path} - run build.py first")

    lib = fetch_lib()
    three = fetch_url(THREE_URL)
    for blob, what in ((lib, "3d-force-graph library"),
                       (three, "three.js")):
        if "</script" in blob:
            raise SystemExit(f"cannot inline {what}: contains '</script'")

    graph = graph_path.read_text(encoding="utf-8")
    # '<\/' is a valid JSON escape and prevents premature </script> parsing
    graph_safe = graph.replace("</", "<\\/")
    app = (WEB / "app.js").read_text(encoding="utf-8")
    if "</script" in app:
        raise SystemExit("app.js unexpectedly contains '</script'")
    html = (WEB / "index.html").read_text(encoding="utf-8")

    def must_replace(old: str, new: str, what: str):
        if old not in html:
            raise SystemExit(f"expected marker not found in index.html: {what}")
        return html.replace(old, new)

    html = must_replace(
        '<script src="https://unpkg.com/3d-force-graph"></script>',
        f"<script>\n{lib}\n</script>", "library script tag")
    html = must_replace(
        '<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>',
        f"<script>\n{three}\n</script>", "three.js script tag")
    html = must_replace(
        '<script src="app.js"></script>',
        f"<script>window.COLOBRI_GRAPH = {graph_safe};</script>\n"
        f"<script>\n{app}\n</script>", "app script tag")
    html = must_replace(
        'src="assets/colibri-outline.png"',
        f'src="{data_uri(WEB / "assets" / "colibri-outline.png", "image/png")}"',
        "header logo")
    html = must_replace(
        'href="assets/colibri.png"',
        f'href="{data_uri(WEB / "assets" / "colibri.png", "image/png")}"',
        "favicon")

    # sanity: nothing external should remain
    leftovers = [m for m in ('src="http', 'src="assets', 'href="assets',
                             "unpkg.com/3d-force-graph\"></script>")
                 if m in html]
    if leftovers:
        raise SystemExit(f"external references remain: {leftovers}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    size_mb = out_path.stat().st_size / 1e6

    # loud signal if the Collibra operating model is inside the bundle
    graph_data = json.loads(graph)
    collibra_nodes = sum(1 for n in graph_data.get("nodes", [])
                         if n.get("kind") in ("AssetType", "AttributeType",
                                              "RelationType"))
    print(f"standalone export: {out_path} "
          f"({size_mb:.1f} MB, {len(graph_data.get('nodes', []))} nodes)")
    if collibra_nodes:
        print(f"WARNING: the embedded graph contains {collibra_nodes} "
              f"Collibra operating model nodes. Rebuild without "
              f"--with-collibra if you want ontologies only.")
    print("open it directly in a browser - no server needed")


if __name__ == "__main__":
    sys.exit(main())
