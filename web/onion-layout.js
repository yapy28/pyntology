// The onion layout: literal bubble-within-bubble, balloon-tree style.
// Every subtree gets a radius computed bottom-up from its children's
// radii; children are packed around their parent at a distance derived
// from those radii; the parent's shell radius is then guaranteed to
// contain every child shell. Nesting is by construction, not by hope.
function onionLayout(nodes, links) {
  const CONT = new Set(['definedBy', 'definedIn', 'hostedIn', 'storedIn']);
  const containerOf = new Map();
  for (const l of links) {
    if (CONT.has(l.type) && !containerOf.has(l.source)) {
      containerOf.set(l.source, l.target);
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const store = nodes.find((n) => n.kind === 'Store');
  const storeId = store ? store.id : null;

  const childrenOf = new Map();
  for (const [child, parent] of containerOf) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(child);
  }

  // visual radius of a leaf node, matching the renderer's own sizing
  const nodeRadius = (n) => 6 + 5 * Math.cbrt((n.val || 0) + 1);

  // bottom-up balloon radii
  const R = new Map();
  const packD = new Map();
  const radiusOf = (id, seen = new Set()) => {
    if (R.has(id)) return R.get(id);
    if (seen.has(id)) return 1;
    seen.add(id);
    const kids = childrenOf.get(id) || [];
    if (!kids.length) {
      const n = byId.get(id);
      const r = n ? nodeRadius(n) : 10;
      R.set(id, r);
      return r;
    }
    let sumSq = 0;
    let maxR = 0;
    for (const c of kids) {
      const rc = radiusOf(c, seen);
      sumSq += rc * rc;
      maxR = Math.max(maxR, rc);
    }
    // packing distance: enough solid angle on the sphere for all children
    const d = 1.5 * Math.sqrt(sumSq) + 30;
    packD.set(id, d);
    // the shell must contain every child shell, center offset included
    const r = d + maxR + 40;
    R.set(id, r);
    return r;
  };
  for (const n of nodes) radiusOf(n.id);

  const fib = (i, n) => {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(1, n));
    const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
    return {
      x: Math.cos(theta) * Math.sin(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(phi),
    };
  };

  const pos = new Map();
  if (storeId) pos.set(storeId, { x: 0, y: 0, z: 0 });

  // containerless namespaces (e.g. a file's module) orbit the store
  const orphans = [...childrenOf.keys()]
    .filter((id) => !pos.has(id) && !containerOf.has(id));
  const orphanRing = (packD.get(storeId) || 600) * 0.9;
  orphans.forEach((id, i) => {
    const d = fib(i, orphans.length + 1);
    pos.set(id, { x: d.x * orphanRing, y: d.y * orphanRing, z: d.z * orphanRing });
  });

  // top-down placement: children on fibonacci spheres at their packing distance
  const queue = [storeId, ...orphans].filter(Boolean);
  while (queue.length) {
    const parent = queue.shift();
    const base = pos.get(parent);
    if (!base) continue;
    const kids = (childrenOf.get(parent) || []).slice()
      .sort((a, b) => (R.get(b) || 0) - (R.get(a) || 0));
    const d = packD.get(parent) || 80;
    kids.forEach((child, i) => {
      if (pos.has(child)) return;
      const dir = fib(i, kids.length);
      pos.set(child, {
        x: base.x + dir.x * d,
        y: base.y + dir.y * d,
        z: base.z + dir.z * d,
      });
      queue.push(child);
    });
  }

  // unchained nodes float just outside the outermost shell
  const unplaced = nodes.filter((n) => !pos.has(n.id));
  let maxR = 0;
  for (const p of pos.values()) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  const outerR = maxR + (R.get(storeId) || 400) * 0.4 + 100;
  unplaced.forEach((n, i) => {
    const d = fib(i, unplaced.length);
    pos.set(n.id, { x: d.x * outerR, y: d.y * outerR, z: d.z * outerR });
  });

  // one shell per container, at its true balloon radius
  const shells = [];
  for (const [parent, kids] of childrenOf) {
    const center = pos.get(parent);
    const kind = byId.get(parent)?.kind;
    if (!center || !kids.length) continue;
    if (!['Store', 'Graph', 'Ontology', 'Module'].includes(kind)) continue;
    shells.push({ id: parent, center, radius: R.get(parent), kind });
  }
  return { pos, shells };
}
