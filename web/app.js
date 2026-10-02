/* Colibri — 3D visualization of the Collibra operating model.
 * Loads web/graph.json (built by build/build.py from the colibri RDF graph)
 * and renders it with 3d-force-graph. Two modes: Free (all links, force
 * layout) and Strata (subclass links only, DAG layout along the z-axis).
 */

const COLORS = {
  AssetType: '#2ec4b6',
  AttributeType: '#ffbf69',
  RelationType: '#c77dff',
  Ontology: '#4361ee',
  Class: '#90be6d',
  Property: '#e07a5f',
  Concept: '#f9c74f',
  Vocabulary: '#4cc9f0',
  Metatype: '#b5179e',
  Exception: '#f94144',
  Value: '#a9d6ff',
  Callable: '#bc6c25',
  Module: '#606c38',
  Protocol: '#7cb518',
  Shape: '#ff7b00',
  Violation: '#ff006e',
  Store: '#3a0ca3',
  Graph: '#f6bd60',
  root: '#ff5d8f',
  dim: '#1c2b33',
  selected: '#ffffff',
  unknown: '#7c8f99',
};
const KIND_LABELS = {
  AssetType: 'asset type', AttributeType: 'attribute type',
  RelationType: 'relation type', Ontology: 'ontology', Class: 'class',
  Property: 'property', Concept: 'concept', Vocabulary: 'vocabulary',
  Metatype: 'metatype', Exception: 'exception', Value: 'value',
  Callable: 'callable', Module: 'module', Protocol: 'protocol',
  Shape: 'SHACL shape', Violation: 'violation',
  Store: 'store', Graph: 'named graph',
};
const HIER_LINKS = ['subclass', 'subProperty', 'broader', 'imports',
                    'storedIn', 'hostedIn',
                    'instanceOf', 'metaclassOf', 'mroNext'];
const LINK_COLOR = {
  subclass: 'rgba(46, 196, 182, 0.55)',
  subProperty: 'rgba(46, 196, 182, 0.55)',
  broader: 'rgba(249, 199, 79, 0.5)',
  imports: 'rgba(67, 97, 238, 0.6)',
  inScheme: 'rgba(76, 201, 240, 0.5)',
  instanceOf: 'rgba(169, 214, 255, 0.5)',
  metaclassOf: 'rgba(181, 23, 158, 0.5)',
  mroNext: 'rgba(255, 255, 255, 0.18)',
  calls: 'rgba(188, 108, 37, 0.55)',
  definedIn: 'rgba(96, 108, 56, 0.45)',
  raises: 'rgba(249, 65, 68, 0.55)',
  raisesWhen: 'rgba(249, 65, 68, 0.4)',
  precondition: 'rgba(249, 199, 79, 0.45)',
  implementsProtocol: 'rgba(124, 181, 24, 0.5)',
  callCategory: 'rgba(249, 201, 63, 0.45)',
  targets: 'rgba(255, 123, 0, 0.5)',
  property: 'rgba(255, 123, 0, 0.35)',
  path: 'rgba(255, 123, 0, 0.3)',
  hasValue: 'rgba(255, 123, 0, 0.4)',
  classConstraint: 'rgba(255, 123, 0, 0.4)',
  violationOf: 'rgba(255, 0, 110, 0.5)',
  violationAt: 'rgba(255, 0, 110, 0.45)',
  storedIn: 'rgba(58, 12, 163, 0.45)',
  hostedIn: 'rgba(246, 189, 96, 0.45)',
  assignedTo: 'rgba(255, 191, 105, 0.45)',
  head: 'rgba(199, 125, 255, 0.45)',
  tail: 'rgba(199, 125, 255, 0.45)',
  domain: 'rgba(224, 122, 95, 0.5)',
  range: 'rgba(224, 122, 95, 0.5)',
  inverseOf: 'rgba(255, 255, 255, 0.3)',
  definedBy: 'rgba(67, 97, 238, 0.28)',
};
const DIM_LINK = 'rgba(255, 255, 255, 0.03)';

const REL_LABELS = {
  instanceOf: 'instance of', subclassOf: 'subclass of',
  subProperty: 'subproperty of', mroNext: 'next in MRO',
  metaclassOf: 'metaclass of', calls: 'calls', definedIn: 'defined in',
  definedBy: 'defined by', broader: 'broader than', inScheme: 'in scheme',
  imports: 'imports', domain: 'domain of', range: 'range of',
  head: 'head of', tail: 'tail of', assignedTo: 'assigned to',
  inverseOf: 'inverse of', raises: 'raises',
  raisesWhen: 'raises when', precondition: 'requires',
  implementsProtocol: 'implements', callCategory: 'category',
  targets: 'targets', property: 'property', path: 'path',
  hasValue: 'must include', classConstraint: 'must be a',
  violationOf: 'checked by', violationAt: 'violated at',
  storedIn: 'stored in', hostedIn: 'hosted in',
};

function kindLabel(node) {
  // the ontology kind speaks the local dialect: in the Python world the
  // importable definition sets are packages, in the metadata world they are
  // ontologies - same kind, different word
  if (node.kind === 'Ontology'
      && /\/(ns\/py|python\/)/.test(node.id)) {
    return 'package';
  }
  return KIND_LABELS[node.kind] || node.kind;
}

function buildAdjacency(links) {
  const adj = new Map();
  for (const l of links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s).add(t);
    adj.get(t).add(s);
  }
  return adj;
}

function findPath(fromId, toId) {
  // breadth-first search over the undirected graph
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === toId) break;
    for (const nb of (state.adj.get(cur) || [])) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  if (!prev.has(toId)) return null;
  const path = [];
  let cur = toId;
  while (cur !== null && cur !== undefined) {
    path.push(cur);
    cur = prev.get(cur);
  }
  return path.reverse();
}

const state = {
  mode: 'free',
  motion: true,
  selected: null,   // node id
  highlighted: new Set(), // node ids to keep lit (selection, 1-hop, or path)
  nodeById: new Map(),
  parentOf: new Map(),
  childrenOf: new Map(),
  neighbors: new Map(),
  adj: new Map(),
  graph: null,
  fg: null,
};

function isRoot(node) { return node.provenance === 'mock'; }

function nodeColor(node) {
  if (state.highlighted.size) {
    if (state.selected === node.id) return COLORS.selected;
    if (state.highlighted.has(node.id)) {
      if (node.ghost) return COLORS.unknown;
      return isRoot(node) ? COLORS.root : (COLORS[node.kind] || COLORS.unknown);
    }
    return COLORS.dim;
  }
  if (node.ghost) return COLORS.unknown;
  return isRoot(node) ? COLORS.root : (COLORS[node.kind] || COLORS.unknown);
}

function linkColor(link) {
  if (state.highlighted.size) {
    const inSet = state.highlighted.has(link.source.id ?? link.source) &&
                  state.highlighted.has(link.target.id ?? link.target);
    return inSet ? LINK_COLOR[link.type] || 'rgba(255,255,255,0.2)' : DIM_LINK;
  }
  return LINK_COLOR[link.type] || 'rgba(255,255,255,0.25)';
}

function resetHighlight() {
  state.selected = null;
  state.highlighted = new Set();
  document.getElementById('panel').classList.remove('visible');
  if (state.fg) {
    state.fg.nodeColor(nodeColor).linkColor(linkColor);
    refreshParticles();
    state.fg.refresh();
  }
}

function selectNode(id, { fly = false, path = false } = {}) {
  const node = state.nodeById.get(id);
  if (!node) return;
  state.selected = id;

  if (path) {
    state.highlighted = new Set([id]);
    let cur = id;
    const seen = new Set([id]);
    while (state.parentOf.has(cur) && !seen.has(state.parentOf.get(cur))) {
      cur = state.parentOf.get(cur);
      seen.add(cur);
      state.highlighted.add(cur);
    }
  } else {
    const one = new Set([id]);
    for (const l of state.graph.links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (s === id) one.add(t);
      if (t === id) one.add(s);
    }
    state.highlighted = one;
  }

  state.fg.nodeColor(nodeColor).linkColor(linkColor);
  refreshParticles();
  state.fg.refresh();
  renderPanel(node);
  if (fly) {
    const dist = 260;
    const pos = node.x !== undefined ? node : state.fg.graph2ScreenCoords;
    state.fg.cameraPosition(
      { x: (pos.x || 0) * 0.6, y: (pos.y || 0) * 0.4, z: (pos.z || 0) + dist },
      pos,
      900
    );
  }
}

function chip(id, label) {
  const n = state.nodeById.get(id);
  const name = label || (n ? n.name : id);
  return `<span class="chip" data-node="${id}">${escapeHtml(name)}</span>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderPanel(node) {
  const panel = document.getElementById('panel');
  const prov = node.provenance || '?';

  // path to root (cycle-guarded)
  const crumbs = [];
  {
    const seen = new Set([node.id]);
    let cur = node.id;
    while (state.parentOf.has(cur) && !seen.has(state.parentOf.get(cur))) {
      cur = state.parentOf.get(cur);
      seen.add(cur);
      crumbs.push(cur);
    }
  }
  crumbs.reverse();
  const pathHtml = crumbs.length
    ? crumbs.map((id) => `<span class="crumb" data-node="${id}">${escapeHtml(state.nodeById.get(id)?.name || id)}</span>`).join('<span class="sep">&#8250;</span>')
    : '<span class="sep">(root)</span>';

  const kids = (state.childrenOf.get(node.id) || []).map((id) => chip(id)).join('') || '<span style="color:var(--muted)">none</span>';

  let sections = '';
  const labelEntries = Object.entries(node.labels || {});
  if (labelEntries.length > 1) {
    const rows = labelEntries.map(([lang, text]) =>
      `<tr><td style="color:var(--muted);padding-right:10px;white-space:nowrap">${lang ? escapeHtml(lang) : '(no language)'}</td><td>${escapeHtml(text)}</td></tr>`).join('');
    sections += `<div class="section"><h3>Labels</h3><table>${rows}</table></div>`;
  }
  sections += `<div class="section"><h3>Structure</h3><div style="color:var(--muted);font-size:12px">subtypes: <b style="color:var(--text)">${node.subtypes ?? 0}</b> &middot; attributes: <b style="color:var(--text)">${node.attrsAssigned ?? 0}</b> &middot; relation endpoints: <b style="color:var(--text)">${node.relEndpoints ?? 0}</b></div></div>`;
  if (node.towerLevel !== null && node.towerLevel !== undefined) {
    const levelNames = ['value (level 0)', 'type (level 1)', 'metatype (level 2)', 'type itself - the fixed point (level 3)'];
    sections += `<div class="section"><h3>Python tower</h3><div>${levelNames[node.towerLevel] ?? 'level ' + node.towerLevel}</div></div>`;
  }
  sections += `<div class="section"><h3>Path to root</h3><div class="path">${pathHtml}</div></div>`;
  sections += `<div class="section"><h3>Direct subtypes (${(state.childrenOf.get(node.id) || []).length})</h3><div>${kids}</div></div>`;

  if (node.kind === 'AttributeType') {
    if (node.attrKind) sections += `<div class="section"><h3>Kind</h3><div>${escapeHtml(node.attrKind)}</div></div>`;
    if (node.unrestricted) {
      sections += `<div class="section"><h3>Assigned to</h3><div>all asset types (unrestricted)</div></div>`;
    } else if (node.unassigned) {
      sections += `<div class="section"><h3>Assigned to</h3><div style="color:var(--muted)">assignment not documented in the OOTB reference table</div></div>`;
    } else {
      const assigned = (state.neighbors.get(node.id) || []).filter((id) => state.nodeById.get(id)?.kind === 'AssetType');
      if (assigned.length) {
        sections += `<div class="section"><h3>Assigned to (${assigned.length})</h3><div>${assigned.map((id) => chip(id)).join('')}</div></div>`;
      }
    }
    if (node.possibleValues && node.possibleValues.length) {
      sections += `<div class="section"><h3>Possible values</h3><div>${node.possibleValues.map((v) => `<span class="chip" style="cursor:default">${escapeHtml(v)}</span>`).join('')}</div></div>`;
    }
  }
  if (node.kind === 'RelationType' && node.coRole) {
    sections += `<div class="section"><h3>Co-role</h3><div>${escapeHtml(node.coRole)}</div></div>`;
  }
  if (node.kind === 'Shape') {
    const v = node.violations || 0;
    sections += `<div class="section"><h3>SHACL</h3><div style="color:${v ? COLORS.Violation : '#7cb518'}">${
      v ? `${v} violation${v === 1 ? '' : 's'} - something inside this bubble slipped out`
         : 'conforms - everything inside this bubble holds'}</div></div>`;
  }

  // every edge, labeled: what each line in the 3D view actually means
  {
    const seen = new Set();
    const rels = [];
    for (const l of state.graph.links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (s === node.id) {
        const key = l.type + '>' + t;
        if (!seen.has(key)) { seen.add(key); rels.push([l.type, '>', t]); }
      } else if (t === node.id) {
        const key = l.type + '<' + s;
        if (!seen.has(key)) { seen.add(key); rels.push([l.type, '<', s]); }
      }
    }
    if (rels.length) {
      const rows = rels.slice(0, 40).map(([type, dir, other]) =>
        `<div style="margin:2px 0;font-size:12.5px"><span style="color:var(--muted)">${REL_LABELS[type] || type} ${dir === '>' ? '&#8594;' : '&#8592;'}</span> ${chip(other)}</div>`).join('');
      const more = rels.length > 40
        ? `<div style="color:var(--muted);font-size:12px;margin-top:4px">+ ${rels.length - 40} more</div>` : '';
      sections += `<div class="section"><h3>Relations (${rels.length})</h3>${rows}${more}</div>`;
    }
  }

  // pathfinding to any other node
  sections += `<div class="section"><h3>Find path to any node</h3>
    <input id="path-input" list="node-names" placeholder="node name... (Enter)" style="width:92%;background:#101c22;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12.5px;outline:none">
    <div id="path-result" style="margin-top:6px"></div></div>`;

  panel.innerHTML = `
    <div class="kind">${kindLabel(node)}${node.product ? ' &middot; ' + escapeHtml(node.product) : ''}</div>
    <h2>${escapeHtml(node.name)}</h2>
    <div class="prov">provenance: ${escapeHtml(prov)}</div>
    <div class="desc">${escapeHtml(node.description || '')}</div>
    ${sections}
    <div class="actions">
      <button id="btn-path">Path to root</button>
      <button id="btn-focus">Fly to</button>
      <button id="btn-clear">Clear</button>
    </div>
  `;
  panel.classList.add('visible');
  panel.querySelectorAll('[data-node]').forEach((el) => {
    el.addEventListener('click', () => selectNode(el.dataset.node, { fly: true }));
  });
  document.getElementById('btn-path').addEventListener('click', () => selectNode(node.id, { path: true }));
  document.getElementById('btn-focus').addEventListener('click', () => selectNode(node.id, { fly: true }));
  document.getElementById('btn-clear').addEventListener('click', resetHighlight);

  const pathInput = document.getElementById('path-input');
  pathInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = pathInput.value.trim().toLowerCase();
    if (!q) return;
    const result = document.getElementById('path-result');
    const target = state.graph.nodes.find((n) => n.name.toLowerCase() === q)
      || state.graph.nodes.find((n) => n.name.toLowerCase().includes(q));
    if (!target) {
      result.innerHTML = '<span style="color:var(--muted)">no such node</span>';
      return;
    }
    if (target.id === node.id) {
      result.innerHTML = '<span style="color:var(--muted)">that is this node</span>';
      return;
    }
    const path = findPath(node.id, target.id);
    if (!path) {
      result.innerHTML = '<span style="color:var(--muted)">no path (different components)</span>';
      return;
    }
    state.selected = node.id;
    state.highlighted = new Set(path);
    state.fg.nodeColor(nodeColor).linkColor(linkColor);
    refreshParticles();
    state.fg.refresh();
    const steps = path.length - 1;
    result.innerHTML = `<div style="color:var(--muted);font-size:11.5px;margin-bottom:4px">${steps} step${steps === 1 ? '' : 's'}:</div>`
      + `<div class="path">${path.map((id) => `<span class="crumb" data-node="${id}">${escapeHtml(state.nodeById.get(id)?.name || id)}</span>`).join('<span class="sep">&#8250;</span>')}</div>`;
    result.querySelectorAll('[data-node]').forEach((el) => {
      el.addEventListener('click', () => selectNode(el.dataset.node, { fly: true }));
    });
  });
}

// The onion layout: bubble within bubble. Every node's containment chain
// (definedIn/definedBy -> module/ontology -> hostedIn -> graph -> storedIn
// -> store) determines its place: the store sits at the center, graphs
// form a cluster around it, ontologies nest inside their graph, entities
// nest inside their ontology. Unchained nodes float on the outer shell.
function onionLayout(nodes, links) {
  const CONT = new Set(['definedBy', 'definedIn', 'hostedIn', 'storedIn']);
  const containerOf = new Map();
  for (const l of links) {
    if (CONT.has(l.type) && !containerOf.has(l.source)) {
      containerOf.set(l.source, l.target);
    }
  }
  const store = nodes.find((n) => n.kind === 'Store');
  const storeId = store ? store.id : null;

  const pos = new Map();
  if (storeId) pos.set(storeId, { x: 0, y: 0, z: 0 });

  const childrenOf = new Map();
  for (const [child, parent] of containerOf) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(child);
  }

  // subtree sizes drive cluster radii
  const subSize = new Map();
  const sizeOf = (id, seen = new Set()) => {
    if (subSize.has(id)) return subSize.get(id);
    if (seen.has(id)) return 1;
    seen.add(id);
    let n = 1;
    for (const c of childrenOf.get(id) || []) n += sizeOf(c, seen);
    subSize.set(id, n);
    return n;
  };
  for (const n of nodes) sizeOf(n.id);

  const fib = (i, n) => {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(1, n));
    const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
    return {
      x: Math.cos(theta) * Math.sin(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(phi),
    };
  };

  // rescue pass: namespaces with children but NO container of their own
  // (e.g. a file's module) get their own shell around the store. Nodes that
  // do have a container wait for the BFS to place them inside it.
  const orphans = [...childrenOf.keys()]
    .filter((id) => !pos.has(id) && !containerOf.has(id));
  orphans.forEach((id, i) => {
    const d = fib(i, orphans.length + 1);
    pos.set(id, { x: d.x * 420, y: d.y * 420, z: d.z * 420 });
  });

  // BFS placement: children on fibonacci spheres around their parent
  const queue = [storeId, ...orphans].filter(Boolean);
  while (queue.length) {
    const parent = queue.shift();
    const base = pos.get(parent);
    if (!base) continue;
    const kids = (childrenOf.get(parent) || []).slice()
      .sort((a, b) => (subSize.get(b) || 1) - (subSize.get(a) || 1));
    const total = kids.reduce((a, c) => a + (subSize.get(c) || 1), 0);
    const r = Math.max(80, Math.sqrt(Math.max(1, total)) * 28);
    kids.forEach((child, i) => {
      if (pos.has(child)) return;
      const d = fib(i, kids.length);
      const rr = r * (0.9 + Math.random() * 0.25);
      pos.set(child, {
        x: base.x + d.x * rr,
        y: base.y + d.y * rr,
        z: base.z + d.z * rr,
      });
      queue.push(child);
    });
  }

  // unchained nodes float on the outermost shell around everything
  const unplaced = nodes.filter((n) => !pos.has(n.id));
  let maxR = 0;
  for (const p of pos.values()) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  const outerR = maxR + 300;
  unplaced.forEach((n, i) => {
    const d = fib(i, unplaced.length);
    pos.set(n.id, { x: d.x * outerR, y: d.y * outerR, z: d.z * outerR });
  });

  // containment shells: one sphere per container, sized to its children
  const kindById = new Map(nodes.map((n) => [n.id, n.kind]));
  const shells = [];
  for (const [parent, kids] of childrenOf) {
    const base = pos.get(parent);
    if (!base || !kids.length) continue;
    const kind = kindById.get(parent);
    if (!['Store', 'Graph', 'Ontology', 'Module'].includes(kind)) continue;
    let r = 0;
    for (const c of kids) {
      const cp = pos.get(c);
      if (cp) {
        r = Math.max(r, Math.hypot(cp.x - base.x, cp.y - base.y, cp.z - base.z));
      }
    }
    if (r > 0) shells.push({ id: parent, center: base, radius: r + 70, kind });
  }
  return { pos, shells };
}

// translucent containment spheres drawn around each container in onion mode
const SHELL_COLORS = { Store: '#3a0ca3', Graph: '#f6bd60', Ontology: '#4361ee', Module: '#90be6d' };
let shellGroup = null;

function buildShells(shells) {
  clearShells();
  if (!window.THREE || !shells || !shells.length) {
    if (!window.THREE) {
      document.getElementById('hint').textContent =
        'onion: three.js not loaded - showing clusters without shells';
    }
    return;
  }
  shellGroup = new window.THREE.Group();
  for (const s of shells) {
    const geo = new window.THREE.SphereGeometry(s.radius, 36, 24);
    const mat = new window.THREE.MeshBasicMaterial({
      color: SHELL_COLORS[s.kind] || '#7c8f99',
      transparent: true,
      opacity: 0.06,
      side: window.THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new window.THREE.Mesh(geo, mat);
    mesh.position.set(s.center.x, s.center.y, s.center.z);
    mesh.raycast = () => {}; // shells must never steal node clicks
    mesh.renderOrder = -1;  // draw behind the nodes
    shellGroup.add(mesh);
  }
  state.fg.scene().add(shellGroup);
}

function clearShells() {
  if (!shellGroup) return;
  shellGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  state.fg.scene().remove(shellGroup);
  shellGroup = null;
}

function setMode(mode) {
  state.mode = mode;
  ['free', 'strata', 'onion'].forEach((m) => {
    const btn = document.getElementById(`mode-${m}`);
    if (btn) btn.classList.toggle('active', mode === m);
  });

  if (mode === 'onion') {
    const { pos, shells } = onionLayout(state.graph.nodes, state.graph.links);
    for (const n of state.graph.nodes) {
      const p = pos.get(n.id);
      if (p) { n.x = p.x; n.y = p.y; n.z = p.z; }
    }
    state.fg.dagMode(null)
      .graphData({ nodes: state.graph.nodes, links: state.graph.links })
      .cooldownTicks(0)
      .refresh();
    buildShells(shells);
    document.getElementById('hint').textContent =
      'onion: the store at the center, graphs around it, ontologies inside, entities innermost';
    const maxShell = shells.reduce((a, s) => Math.max(a, s.radius), 0);
    state.fg.cameraPosition(
      { x: 0, y: 0, z: Math.max(1800, maxShell * 3.2) },
      { x: 0, y: 0, z: 0 }, 1200);
    return;
  }

  clearShells();
  state.fg.cooldownTicks(Infinity);
  const links = mode === 'strata'
    ? state.graph.links.filter((l) => HIER_LINKS.includes(l.type))
    : state.graph.links;
  state.fg.dagMode(mode === 'strata' ? 'zout' : null)
    .graphData({ nodes: state.graph.nodes, links });
  if (mode === 'strata') {
    state.fg.dagLevelDiff(3).d3Force('charge').strength(-40);
  } else {
    state.fg.d3Force('charge').strength(-60);
  }
  state.fg.d3Reheat();
}

function particleCount(link) {
  if (!state.motion || !state.highlighted.size) return 0;
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  return (state.highlighted.has(s) && state.highlighted.has(t)) ? 2 : 0;
}

function refreshParticles() {
  // new function identity so the graph library re-evaluates the accessor
  state.fg.linkDirectionalParticles((l) => particleCount(l));
}

async function init() {
  let data;
  if (window.COLOBRI_GRAPH) {
    // standalone bundle: the graph was embedded at export time
    data = JSON.parse(JSON.stringify(window.COLOBRI_GRAPH));
  } else {
    const res = await fetch('graph.json');
    if (!res.ok) throw new Error(`graph.json: HTTP ${res.status}`);
    data = await res.json();
  }

  state.graph = data;
  for (const n of data.nodes) state.nodeById.set(n.id, n);
  for (const l of data.links) {
    if (HIER_LINKS.includes(l.type)) {
      if (!state.parentOf.has(l.source)) state.parentOf.set(l.source, l.target);
      if (!state.childrenOf.has(l.target)) state.childrenOf.set(l.target, []);
      state.childrenOf.get(l.target).push(l.source);
    }
    if (!state.neighbors.has(l.source)) state.neighbors.set(l.source, []);
    state.neighbors.get(l.source).push(l.target);
    if (!state.neighbors.has(l.target)) state.neighbors.set(l.target, []);
    state.neighbors.get(l.target).push(l.source);
  }
  state.adj = buildAdjacency(data.links);

  const dl = document.getElementById('node-names');
  dl.innerHTML = data.nodes.map((n) => `<option value="${escapeHtml(n.name)}">`).join('');

  // dynamic legend: one dot per kind present in the graph (+ synthetic root).
  // The ontology kind shows both dialects when both worlds are loaded:
  // 'package' for the Python definition sets, 'ontology' for the rest.
  const present = new Set(data.nodes.map((n) => (isRoot(n) ? '__root__' : n.kind)));
  const hasPyOnto = data.nodes.some((n) => n.kind === 'Ontology' && /\/(ns\/py|python\/)/.test(n.id));
  const hasOtherOnto = data.nodes.some((n) => n.kind === 'Ontology' && !/\/(ns\/py|python\/)/.test(n.id));
  const legend = document.getElementById('legend');
  const rows = [];
  if (hasPyOnto) {
    rows.push(`<div><span class="dot" style="background:${COLORS.Ontology}"></span>package</div>`);
  }
  for (const kind of Object.keys(KIND_LABELS)) {
    if (kind === 'Ontology') {
      if (hasOtherOnto) {
        rows.push(`<div><span class="dot" style="background:${COLORS[kind]}"></span>${KIND_LABELS[kind]}</div>`);
      }
      continue;
    }
    if (present.has(kind)) {
      rows.push(`<div><span class="dot" style="background:${COLORS[kind]}"></span>${KIND_LABELS[kind]}</div>`);
    }
  }
  if (present.has('__root__')) {
    rows.push(`<div><span class="dot" style="background:${COLORS.root}"></span>synthetic root</div>`);
  }
  if (present.has('__ghost__') || data.nodes.some((n) => n.ghost)) {
    rows.push(`<div><span class="dot" style="background:${COLORS.unknown}"></span>ghost (referenced, not loaded)</div>`);
  }
  legend.innerHTML = rows.join('');

  let motionOn = true;
  const motionBtn = document.getElementById('toggle-particles');

  // node size and link spacing steppers
  const sizeState = { rel: 5, dist: 45 };
  const bindStepper = (id, apply) => {
    document.getElementById(id).addEventListener('click', apply);
  };
  bindStepper('size-up', () => {
    sizeState.rel = Math.min(24, sizeState.rel + 2);
    state.fg.nodeRelSize(sizeState.rel);
  });
  bindStepper('size-down', () => {
    sizeState.rel = Math.max(1.5, sizeState.rel - 2);
    state.fg.nodeRelSize(sizeState.rel);
  });
  // spacing adjusts every layout knob, so it works in free AND strata mode
  const setSpacing = (d) => {
    sizeState.dist = d;
    const link = state.fg.d3Force('link');
    if (link && link.distance) link.distance(d);
    const charge = state.fg.d3Force('charge');
    if (charge && charge.strength) charge.strength(-Math.max(60, d * 1.2));
    state.fg.dagLevelDistance(Math.max(20, Math.round(d / 2)));
    state.fg.d3Reheat();
  };
  bindStepper('space-up', () => setSpacing(Math.min(500, sizeState.dist + 25)));
  bindStepper('space-down', () => setSpacing(Math.max(15, sizeState.dist - 25)));

  motionBtn.addEventListener('click', () => {
    motionOn = !motionOn;
    state.motion = motionOn;
    motionBtn.classList.toggle('active', motionOn);
    refreshParticles();
    state.fg.refresh();
  });

  state.fg = ForceGraph3D()(document.getElementById('graph'))
    .graphData({ nodes: data.nodes, links: data.links })
    .backgroundColor('#0d1418')
    .nodeLabel((n) => `<div style="font-size:13px"><b>${escapeHtml(n.name)}</b><br>${n.kind}</div>`)
    .nodeVal((n) => (n.val || 0) + 1)
    .nodeRelSize(5)
    .nodeColor(nodeColor)
    .linkColor(linkColor)
    .linkOpacity(0.7)
    .nodeOpacity(0.95)
    .linkDirectionalParticles(particleCount)
    .linkDirectionalParticleWidth(1.6)
    .linkDirectionalParticleSpeed(0.004)
    .onDagError(() => {
      document.getElementById('hint').textContent =
        'strata: cyclic links found (e.g. mutual imports) - switched back to free layout';
      setMode('free');
    })
    .onNodeClick((n) => selectNode(n.id))
    .onBackgroundClick(resetHighlight);

  state.fg.d3Force('link').distance(45);

  document.getElementById('mode-free').addEventListener('click', () => setMode('free'));
  document.getElementById('mode-strata').addEventListener('click', () => setMode('strata'));
  document.getElementById('mode-onion').addEventListener('click', () => setMode('onion'));

  const search = document.getElementById('search');
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const hit = data.nodes.find((n) => n.name.toLowerCase() === q)
      || data.nodes.find((n) => n.name.toLowerCase().includes(q));
    if (hit) {
      selectNode(hit.id, { fly: true });
    } else {
      search.placeholder = `no match for "${q}"`;
    }
  });

  document.getElementById('loading').style.display = 'none';
}

init().catch((err) => {
  document.getElementById('loading').textContent =
    `failed to load: ${err.message} — serve web/ over http, e.g. python3 -m http.server`;
});
