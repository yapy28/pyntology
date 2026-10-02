// Serves web/ over http, fetches every asset the page needs, and validates
// graph.json referential integrity. Exits non-zero on failure.
// Usage: node scripts/verify_web.mjs

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const file = join(webDir, req.url.split('?')[0].replace(/^\//, '') || 'index.html');
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${base}/index.html`);
    check('index.html served', page.ok, String(page.status));
    const html = await page.text();
    check('index.html references app.js', html.includes('src="app.js"'));
    check('index.html references 3d-force-graph', html.includes('unpkg.com/3d-force-graph'));
    check('index.html references logo', html.includes('assets/colibri-outline.png'));

    const logo = await fetch(`${base}/assets/colibri-outline.png`);
    check('logo image served', logo.ok, String(logo.status));
    const logoBytes = new Uint8Array(await logo.arrayBuffer());
    check('logo image is a PNG', logoBytes[0] === 0x89 && logoBytes[1] === 0x50);
    const favicon = await fetch(`${base}/assets/colibri.png`);
    check('favicon served', favicon.ok, String(favicon.status));

    const js = await fetch(`${base}/app.js`);
    check('app.js served', js.ok, String(js.status));

    const graph = await fetch(`${base}/graph.json`);
    check('graph.json served', graph.ok, String(graph.status));
    const data = await graph.json();

    const ids = new Set(data.nodes.map((n) => n.id));
    check('nodes present', data.nodes.length > 0, `${data.nodes.length} nodes`);
    check('node ids unique', ids.size === data.nodes.length);

    let dangling = 0;
    for (const l of data.links) {
      if (!ids.has(l.source) || !ids.has(l.target)) dangling++;
    }
    check('no dangling link endpoints', dangling === 0, dangling ? `${dangling} dangling` : `${data.links.length} links`);

    // cycle check per relation type, mixed relations must not be composed
    // (object instanceOf type while type subclassOf object - the braid is
    // legal Python, not a cycle). Self-loops are allowed (type instanceOf
    // type, the fixed point). Mutual owl:imports are legal OWL and only
    // reported, since the viewer falls back to free layout for them.
    const HIER = ['subclass', 'subProperty', 'broader', 'imports',
                  'instanceOf', 'metaclassOf', 'mroNext'];
    const hardCycles = [];
    const notes = [];
    for (const rel of HIER) {
      const edges = data.links.filter((l) => l.type === rel
        && l.source !== l.target);
      const parentOf = new Map(edges.map((l) => [l.source, l.target]));
      let cycles = 0;
      for (const start of parentOf.keys()) {
        const seen = new Set([start]);
        let cur = start;
        while (parentOf.has(cur)) {
          cur = parentOf.get(cur);
          if (seen.has(cur)) { cycles++; break; }
          seen.add(cur);
        }
      }
      if (cycles) {
        (rel === 'imports' ? notes : hardCycles).push(`${rel}: ${cycles}`);
      }
      const selfLoops = data.links.filter((l) => l.type === rel
        && l.source === l.target).length;
      if (selfLoops) {
        notes.push(`${rel}: ${selfLoops} fixed-point self-loop(s)`);
      }
    }
    check('hierarchy acyclic per relation', hardCycles.length === 0,
      hardCycles.join(', ') || 'no hard cycles');
    for (const note of notes) {
      check(`note: ${note}`, true);
    }

    const subclass = data.links.filter((l) => l.type === 'subclass');
    if (data.nodes.some((n) => n.kind === 'AssetType')) {
      const parentless = data.nodes.filter(
        (n) => n.kind === 'AssetType' && !subclass.some((l) => l.source === n.id)
      ).map((n) => n.name);
      check('single parentless Asset root', parentless.length === 1 && parentless[0] === 'Asset',
        JSON.stringify(parentless));
    } else {
      check('Collibra base not loaded (ontologies-only build)', true);
    }
  } catch (err) {
    failures.push(err.message);
    console.log('FAIL', err.message);
  } finally {
    server.close();
  }
  if (failures.length) {
    console.log(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nall web checks passed');
});
