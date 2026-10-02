/* Pyntology onion: a dedicated three.js renderer for the containment graph.
 * Fresnel-shaded glass bubbles nested by the balloon-tree layout, nodes
 * glowing inside them, relation wires crossing the levels - with the full
 * interaction model: clickable bubbles, selection highlight, 1-hop edges,
 * search, and a relations panel where every chip flies you there.
 */

const NODE_COLORS = {
  AssetType: '#2ec4b6', AttributeType: '#ffbf69', RelationType: '#c77dff',
  Ontology: '#4361ee', Class: '#90be6d', Property: '#e07a5f',
  Concept: '#f9c74f', Vocabulary: '#4cc9f0', Metatype: '#b5179e',
  Exception: '#f94144', Value: '#a9d6ff', Callable: '#bc6c25',
  Module: '#606c38', Protocol: '#7cb518', Shape: '#ff7b00',
  Violation: '#ff006e', Store: '#3a0ca3', Graph: '#f6bd60',
  Variable: '#ffd166',
};
const SHELL_COLORS = { Store: '#8b7bff', Graph: '#f6bd60', Ontology: '#4361ee', Module: '#90be6d' };
const EDGE_COLORS = {
  subclass: '#2ec4b6', subProperty: '#2ec4b6', broader: '#f9c74f',
  imports: '#4361ee', inScheme: '#4cc9f0', instanceOf: '#a9d6ff',
  metaclassOf: '#b5179e', mroNext: '#4a5568', calls: '#bc6c25',
  definedIn: '#606c38', definedBy: '#4361ee', raises: '#f94144',
  raisesWhen: '#f94144', precondition: '#f9c74f',
  implementsProtocol: '#7cb518', callCategory: '#f9c74f',
  targets: '#ff7b00', property: '#ff7b00', path: '#ff7b00',
  hasValue: '#ff7b00', classConstraint: '#ff7b00',
  violationOf: '#ff006e', violationAt: '#ff006e',
  storedIn: '#8b7bff', hostedIn: '#f6bd60',
  assignedTo: '#ffbf69', head: '#c77dff', tail: '#c77dff',
  domain: '#e07a5f', range: '#e07a5f', inverseOf: '#7c8f99',
  flowIn: '#3ddc97', flowOut: '#3ddc97', binds: '#ffd166',
};
const CONT_LINKS = ['definedBy', 'definedIn', 'hostedIn', 'storedIn'];
// the Python dialect: kinds display in Python's own words, not RDF's
const KIND_LABELS = {
  Store: 'runtime', Graph: 'package', Ontology: 'namespace',
  Vocabulary: 'taxonomy', Shape: 'invariant', Module: 'module',
  Value: 'value', Callable: 'callable', Class: 'class', Type: 'class',
  Metatype: 'metatype', Exception: 'exception', Protocol: 'protocol',
  Concept: 'concept', Property: 'property', Violation: 'violation',
  Variable: 'variable',
};
const kindLabel = (n) => KIND_LABELS[n.kind] || n.kind.toLowerCase();
const fromLabel = (p) => {
  if (p === 'runtime' || p === 'container') return 'the runtime';
  if (p === 'ghost') return 'not loaded';
  return p || '?';
};
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
  storedIn: 'loaded into', hostedIn: 'declared in',
  flowIn: 'flows in', flowOut: 'flows out', binds: 'binds',
};

const FRESNEL_VERT = `
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FRESNEL_FRAG = `
  uniform vec3 uColor; uniform float uBoost;
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    float f = pow(clamp(0.82 - dot(vNormal, vView), 0.0, 1.0), 2.2);
    gl_FragColor = vec4(uColor, 1.0) * f * 1.6 * uBoost;
  }`;

const state = {
  data: null, byId: new Map(), pos: null,
  nodeMeshes: new Map(),      // id -> mesh
  shellRims: new Map(),       // container id -> rim mesh
  selected: null, neighbors: new Set(),
  selEdges: null,             // highlight LineSegments
  camera: null, target: null,
  dist: 1000, theta: 0.7, phi: 1.15, maxShell: 600,
  flyTo: null,                // {x, y, z, dist} eased camera goal
  running: false, runCancel: false, runMarked: [],
  dots: [],                  // traveling flow dots: {mesh, from, to, t0, dur}
};

function makeTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '600 44px -apple-system, Segoe UI, Roboto, sans-serif';
  const w = Math.max(60, ctx.measureText(text).width + 30);
  canvas.width = w; canvas.height = 70;
  const c2 = canvas.getContext('2d');
  c2.font = '600 44px -apple-system, Segoe UI, Roboto, sans-serif';
  c2.fillStyle = color;
  c2.fillText(text, 15, 50);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w * 0.55, 38, 1);
  sprite.raycast = () => {};
  return sprite;
}

async function main() {
  const data = window.COLOBRI_GRAPH
    ? JSON.parse(JSON.stringify(window.COLOBRI_GRAPH))
    : await (await fetch('graph.json')).json();
  if (typeof onionLayout !== 'function' || !window.THREE) {
    document.body.insertAdjacentHTML('beforeend',
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#7c8f99">missing three.js or onion-layout.js</div>');
    return;
  }
  state.data = data;
  state.byId = new Map(data.nodes.map((n) => [n.id, n]));
  const { pos, shells } = onionLayout(data.nodes, data.links);
  state.pos = pos;

  // scene
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1418');
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 400000);
  state.camera = camera;
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const light = new THREE.DirectionalLight(0xffffff, 0.6);
  light.position.set(1, 1, 1);
  scene.add(light);

  // containment shells: fresnel glass + faint fill + label
  for (const s of shells) {
    const color = SHELL_COLORS[s.kind] || '#7c8f99';
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(s.radius, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uBoost: { value: 1.0 },
        },
        vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
        transparent: true, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    rim.position.set(s.center.x, s.center.y, s.center.z);
    rim.renderOrder = -1;
    rim.userData.containerId = s.id;   // clickable bubble
    rim.userData.radius = s.radius;
    scene.add(rim);
    state.shellRims.set(s.id, rim);
    const fill = new THREE.Mesh(
      new THREE.SphereGeometry(s.radius, 24, 16),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.028,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    fill.position.copy(rim.position);
    fill.renderOrder = -1;
    fill.raycast = () => {};
    scene.add(fill);
    const label = makeTextSprite(state.byId.get(s.id)?.name || s.id.split('/').pop(), color);
    label.position.set(s.center.x, s.center.y + s.radius * 1.02, s.center.z);
    scene.add(label);
  }
  state.maxShell = shells.reduce((a, s) => Math.max(a, s.radius), 600);
  state.dist = state.maxShell * 3.0;

  // nodes
  const nodeGeo = new THREE.SphereGeometry(1, 16, 12);
  for (const n of data.nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const r = (n.val || 0) ? 6 + 5 * Math.cbrt((n.val || 0) + 1) : 7;
    const base = new THREE.Color(NODE_COLORS[n.kind] || '#7c8f99');
    const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshLambertMaterial({
      color: base.clone(), emissive: 0x11181c,
    }));
    mesh.scale.setScalar(Math.max(4, r));
    mesh.position.set(p.x, p.y, p.z);
    mesh.userData.node = n;
    mesh.userData.baseColor = base;
    scene.add(mesh);
    state.nodeMeshes.set(n.id, mesh);
  }

  // edges, grouped by type so colors survive
  for (const [type, color] of Object.entries(EDGE_COLORS)) {
    const pts = [];
    for (const l of data.links) {
      if (l.type !== type) continue;
      const a = pos.get(l.source);
      const b = pos.get(l.target);
      if (!a || !b) continue;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    if (!pts.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.32,
    })));
  }

  // legend
  const kinds = [...new Set(data.nodes.map((n) => n.kind))];
  document.getElementById('legend').innerHTML =
    Object.entries(SHELL_COLORS).map(([k, c]) =>
      `<div><span class="dot" style="background:${c};opacity:.85"></span>${kindLabel({ kind: k })} bubble (clickable)</div>`).join('')
    + kinds.map((k) =>
      `<div><span class="dot" style="background:${NODE_COLORS[k] || '#7c8f99'}"></span>${kindLabel({ kind: k })}</div>`).join('');

  // search
  const dl = document.createElement('datalist');
  dl.id = 'node-names';
  document.body.appendChild(dl);
  dl.innerHTML = data.nodes.map((n) => `<option value="${n.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}">`).join('');
  const search = document.getElementById('search');
  search.setAttribute('list', 'node-names');
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

  // navigation: orbit + pan + zoom, all axes, no dead ends
  const target = new THREE.Vector3(0, 0, 0);
  state.target = target;
  let drag = null;
  const dom = renderer.domElement;
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0,
             pan: e.button === 2 || e.shiftKey };
    state.flyTo = null;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      // pan the focus point along the camera's own screen axes, scaled by
      // distance so the feel is the same at every zoom level; content
      // follows the cursor
      const k = state.dist * 0.0016;
      const view = new THREE.Vector3().subVectors(target, camera.position)
        .normalize();
      const rightAxis = new THREE.Vector3()
        .crossVectors(view, camera.up).normalize();
      const upAxis = new THREE.Vector3()
        .crossVectors(rightAxis, view).normalize();
      target.addScaledVector(rightAxis, -dx * k)
        .addScaledVector(upAxis, dy * k);
    } else {
      state.theta -= dx * 0.005;
      state.phi = Math.min(Math.PI - 0.05,
        Math.max(0.05, state.phi - dy * 0.005));
    }
  });
  dom.addEventListener('wheel', (e) => {
    state.flyTo = null;
    state.dist = Math.min(state.maxShell * 8,
      Math.max(25, state.dist * (1 + e.deltaY * 0.001)));
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.running) cancelRun();
      else { clearRunMarks(); clearSelection(); }
      return;
    }
    // keyboard nudges: full 3D without ever getting stuck
    const step = e.shiftKey ? 0.02 : 0.07;
    if (e.key === 'ArrowLeft') state.theta -= step;
    else if (e.key === 'ArrowRight') state.theta += step;
    else if (e.key === 'ArrowUp')
      state.phi = Math.max(0.05, state.phi - step);
    else if (e.key === 'ArrowDown')
      state.phi = Math.min(Math.PI - 0.05, state.phi + step);
    else if (e.key === '+' || e.key === '=')
      state.dist = Math.max(25, state.dist * 0.9);
    else if (e.key === '-' || e.key === '_')
      state.dist = Math.min(state.maxShell * 8, state.dist * 1.1);
    else if (e.key === 'r' || e.key === 'R')
      flyTo({ x: 0, y: 0, z: 0, dist: state.maxShell * 3.0 });
    else return;
    if (e.key.startsWith('Arrow') || e.key === '+' || e.key === '-'
        || e.key === '=' || e.key === '_') e.preventDefault();
  });

  // picking: nodes first (bubbles never steal node clicks), then bubbles
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (e) => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const nodeHits = raycaster.intersectObjects([...state.nodeMeshes.values()], false);
    if (nodeHits.length) return { node: nodeHits[0].object.userData.node };
    const shellHits = raycaster.intersectObjects([...state.shellRims.values()], false);
    if (shellHits.length) {
      const container = shellHits[0].object.userData.containerId;
      return { node: state.byId.get(container), shell: shellHits[0].object };
    }
    return null;
  };

  // hover tooltip
  const tooltip = document.getElementById('tooltip');
  dom.addEventListener('pointermove', (e) => {
    if (drag && drag.moved > 2) { tooltip.style.display = 'none'; return; }
    const hit = pickAt(e);
    if (hit && hit.node) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
      tooltip.innerHTML = `<b>${hit.node.name}</b> <span style="color:#7c8f99">${hit.node.kind}</span>`;
      dom.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      dom.style.cursor = 'grab';
    }
  });

  // selection: click selects (node or bubble), double-click flies in
  const panel = document.getElementById('panel');
  let lastClick = 0;
  let lastClickId = null;
  dom.addEventListener('click', (e) => {
    if (drag && drag.moved > 6) return;
    if (state.running) return;
    const hit = pickAt(e);
    const now = performance.now();
    if (hit && hit.node) {
      const fly = (now - lastClick < 350 && lastClickId === hit.node.id);
      selectNode(hit.node.id, { fly: fly || !!hit.shell, shell: hit.shell });
      lastClick = now;
      lastClickId = hit.node.id;
    } else {
      clearSelection();
    }
  });

  // panel chips fly to their node
  panel.addEventListener('click', (e) => {
    const el = e.target.closest('[data-node]');
    if (el) selectNode(el.dataset.node, { fly: true });
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const frame = () => {
    // eased camera flight: approach the goal, never teleport
    if (state.flyTo) {
      const goal = state.flyTo;
      target.lerp(goal, 0.08);
      state.dist += (goal.dist - state.dist) * 0.08;
      if (target.distanceTo(goal) < 0.5
          && Math.abs(goal.dist - state.dist) < 1) {
        target.copy(goal);
        state.flyTo = null;
      }
    }
    // traveling flow dots, born and dying with their stage
    const now = performance.now();
    for (let i = state.dots.length - 1; i >= 0; i--) {
      const d = state.dots[i];
      const p = Math.min(1, (now - d.t0) / d.dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      d.mesh.position.lerpVectors(d.from, d.to, ease);
      d.mesh.position.y += Math.sin(ease * Math.PI) * d.arc;
      if (p >= 1) {
        scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        state.dots.splice(i, 1);
      }
    }
    camera.position.set(
      target.x + state.dist * Math.sin(state.phi) * Math.cos(state.theta),
      target.y + state.dist * Math.cos(state.phi),
      target.z + state.dist * Math.sin(state.phi) * Math.sin(state.theta));
    camera.lookAt(target);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  frame();

  // ---- selection machinery ----

  function selectNode(id, { fly = false, shell = null } = {}) {
    state.selected = id;
    const n = state.byId.get(id);
    // 1-hop neighborhood
    const nb = new Set([id]);
    for (const l of state.data.links) {
      if (l.source === id) nb.add(l.target);
      if (l.target === id) nb.add(l.source);
    }
    state.neighbors = nb;
    // dim everything, light the neighborhood
    for (const [nid, mesh] of state.nodeMeshes) {
      const mat = mesh.material;
      if (nid === id) mat.color.set('#ffffff');
      else if (nb.has(nid)) mat.color.copy(mesh.userData.baseColor);
      else mat.color.set('#22303a');
    }
    // highlight the 1-hop edges
    if (state.selEdges) {
      scene.remove(state.selEdges);
      state.selEdges.geometry.dispose();
      state.selEdges.material.dispose();
    }
    const pts = [];
    for (const l of state.data.links) {
      if (l.source !== id && l.target !== id) continue;
      const a = pos.get(l.source);
      const b = pos.get(l.target);
      if (a && b) pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    if (pts.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      state.selEdges = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: '#e8fbff', transparent: true, opacity: 0.95,
      }));
      scene.add(state.selEdges);
    }
    // boost the containing bubble's rim
    for (const [cid, rim] of state.shellRims) {
      rim.material.uniforms.uBoost.value = (cid === id) ? 2.2 : 1.0;
    }
    const containerOf = new Map();
    for (const l of state.data.links) {
      if (CONT_LINKS.includes(l.type) && !containerOf.has(l.source)) containerOf.set(l.source, l.target);
    }
    let cur = containerOf.get(id);
    if (cur && state.shellRims.has(cur)) {
      state.shellRims.get(cur).material.uniforms.uBoost.value = 1.9;
    }
    renderPanel(n);
    // flight
    const p = pos.get(id);
    if (fly && p) {
      const mesh = state.nodeMeshes.get(id);
      const scale = mesh ? mesh.scale.x : 8;
      const dist = shell
        ? Math.max(120, shell.userData.radius * 2.4)
        : Math.min(state.dist, 150 + 30 * scale);
      flyTo({ x: p.x, y: p.y, z: p.z, dist });
    }
  }

  function clearSelection() {
    state.selected = null;
    state.neighbors = new Set();
    for (const mesh of state.nodeMeshes.values()) {
      mesh.material.color.copy(mesh.userData.baseColor);
    }
    if (state.selEdges) {
      scene.remove(state.selEdges);
      state.selEdges.geometry.dispose();
      state.selEdges.material.dispose();
      state.selEdges = null;
    }
    for (const rim of state.shellRims.values()) {
      rim.material.uniforms.uBoost.value = 1.0;
    }
    panel.classList.remove('visible');
  }

  // ---- the run button: replay the program's execution order -----------
  // A static reading of main(): the camera glides stage by stage, the
  // values travel as dots along the flow edges, and every produced
  // output pulses green and stays marked until Esc.
  const program = data.program || (data.programs && data.programs[0]);
  const runBtn = document.getElementById('run');
  const stageEl = document.getElementById('stage');
  if (!program || !program.stages || !program.stages.length) {
    runBtn.style.display = 'none';
  } else {
    runBtn.addEventListener('click', () => {
      if (state.running) cancelRun();
      else runProgram();
    });
  }

  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

  function flyTo({ x, y, z, dist }) {
    const goal = new THREE.Vector3(x, y, z);
    goal.dist = dist;
    state.flyTo = goal;
  }

  async function runProgram() {
    state.running = true;
    state.runCancel = false;
    runBtn.textContent = 'Stop';
    runBtn.classList.add('running');
    clearSelection();
    clearRunMarks();
    for (let i = 0; i < program.stages.length; i++) {
      if (state.runCancel) break;
      const st = program.stages[i];
      const name = state.byId.get(st.id)?.name || st.id.split('/').pop();
      stageEl.textContent = `${i + 1}/${program.stages.length} \u2014 ${st.label || name}`;
      stageEl.classList.add('visible');
      playStage(st);
      await sleep(st.dur || 1.4);
    }
    // restore normal colors; the green output marks stay until Esc
    stageEl.classList.remove('visible');
    for (const [nid, mesh] of state.nodeMeshes) {
      if (!state.runMarked.includes(nid)) {
        mesh.material.color.copy(mesh.userData.baseColor);
      }
    }
    state.running = false;
    runBtn.textContent = 'Run';
    runBtn.classList.remove('running');
  }

  function playStage(st) {
    // camera glides to this stage's node
    const p = pos.get(st.id);
    if (p) flyTo({ x: p.x, y: p.y, z: p.z, dist: Math.min(state.dist, 320) });
    // light the stage's cast, dim the rest of the world
    const cast = new Set([st.id, ...(st.glow || [])]);
    for (const [nid, mesh] of state.nodeMeshes) {
      if (nid === st.id) mesh.material.color.set('#ffffff');
      else if (cast.has(nid) && !state.runMarked.includes(nid)) {
        mesh.material.color.copy(mesh.userData.baseColor);
      } else {
        mesh.material.color.set('#1c2b33');
      }
    }
    // a traveling dot per flow edge, arcing through the bubble
    const now = performance.now();
    for (const [s, t] of st.edges || []) {
      const a = pos.get(s);
      const b = pos.get(t);
      if (!a || !b) continue;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#3ddc97' }));
      mesh.raycast = () => {};
      scene.add(mesh);
      const from = new THREE.Vector3(a.x, a.y, a.z);
      const to = new THREE.Vector3(b.x, b.y, b.z);
      state.dots.push({
        mesh, t0: now, dur: (st.dur || 1.4) * 1000, from, to,
        arc: 0.1 * from.distanceTo(to),
      });
    }
    // output produced: pulse it green, keep it marked until Esc
    if (st.pulse && st.pulseNode && state.nodeMeshes.has(st.pulseNode)) {
      const mesh = state.nodeMeshes.get(st.pulseNode);
      mesh.material.color.set('#3ddc97');
      mesh.material.emissive.setHex(0x1f8f4a);
      if (!state.runMarked.includes(st.pulseNode)) {
        state.runMarked.push(st.pulseNode);
      }
    }
  }

  function cancelRun() {
    state.runCancel = true;  // the loop exits after the current stage
  }

  function clearRunMarks() {
    for (const nid of state.runMarked) {
      const mesh = state.nodeMeshes.get(nid);
      if (mesh) {
        mesh.material.color.copy(mesh.userData.baseColor);
        mesh.material.emissive.setHex(0x11181c);
      }
    }
    state.runMarked = [];
  }

  function renderPanel(n) {
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const chain = [];
    const up = new Map();
    for (const l of state.data.links) {
      if (CONT_LINKS.includes(l.type) && !up.has(l.source)) up.set(l.source, l.target);
    }
    let cur = n.id;
    const seen = new Set([cur]);
    while (up.has(cur) && !seen.has(up.get(cur))) {
      cur = up.get(cur);
      seen.add(cur);
      chain.push(cur);
    }
    const rels = [];
    for (const l of state.data.links) {
      const label = REL_LABELS[l.type] || l.type;
      if (l.source === n.id) {
        const other = state.byId.get(l.target);
        rels.push(`<div style="margin:2px 0"><span style="color:#7c8f99">${label} &#8594;</span> <span class="chip" data-node="${l.target}">${esc(other?.name || l.target.split('/').pop())}</span></div>`);
      } else if (l.target === n.id) {
        const other = state.byId.get(l.source);
        rels.push(`<div style="margin:2px 0"><span style="color:#7c8f99">${label} &#8592;</span> <span class="chip" data-node="${l.source}">${esc(other?.name || l.source.split('/').pop())}</span></div>`);
      }
    }
    panel.innerHTML = `
      <div class="kind">${kindLabel(n)}</div>
      <h2>${esc(n.name)}</h2>
      <div class="prov">from: ${esc(fromLabel(n.provenance))}</div>
      <div class="desc">${esc(n.description || '')}</div>
      ${chain.length ? `<div class="section"><h3>Sits inside</h3><div>${chain
        .map((id) => `<span class="chip" data-node="${id}">${esc(state.byId.get(id)?.name || id.split('/').pop())}</span>`)
        .join('<span style="color:#7c8f99"> &#8250; </span>')}</div></div>` : ''}
      ${rels.length ? `<div class="section"><h3>Relations (${rels.length})</h3>${rels.slice(0, 40).join('')}${rels.length > 40 ? `<div style="color:#7c8f99;font-size:12px;margin-top:4px">+ ${rels.length - 40} more</div>` : ''}</div>` : ''}
      <style>.chip { display:inline-block; background:#101c22; border:1px solid #23323a; border-radius:12px;
        padding:2px 10px; margin:2px 4px 2px 0; cursor:pointer; font-size:12.5px; }
        .chip:hover { border-color:#3ddc97; color:#3ddc97; }</style>
    `;
    panel.classList.add('visible');
  }
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#7c8f99">onion failed: ${err.message}</div>`);
});
