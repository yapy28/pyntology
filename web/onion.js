/* Pyntology onion: a dedicated three.js renderer for the containment graph.
 * Fresnel-shaded glass bubbles nested by the balloon-tree layout, nodes
 * glowing inside them, relation wires crossing the levels. No force
 * simulation - the layout is computed, the onion is drawn.
 */

const NODE_COLORS = {
  AssetType: '#2ec4b6', AttributeType: '#ffbf69', RelationType: '#c77dff',
  Ontology: '#4361ee', Class: '#90be6d', Property: '#e07a5f',
  Concept: '#f9c74f', Vocabulary: '#4cc9f0', Metatype: '#b5179e',
  Exception: '#f94144', Value: '#a9d6ff', Callable: '#bc6c25',
  Module: '#606c38', Protocol: '#7cb518', Shape: '#ff7b00',
  Violation: '#ff006e', Store: '#3a0ca3', Graph: '#f6bd60',
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
};
const CONT_LINKS = ['definedBy', 'definedIn', 'hostedIn', 'storedIn'];

const FRESNEL_VERT = `
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FRESNEL_FRAG = `
  uniform vec3 uColor;
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    float f = pow(clamp(0.82 - dot(vNormal, vView), 0.0, 1.0), 2.2);
    gl_FragColor = vec4(uColor, 1.0) * f * 1.6;
  }`;

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

  const { pos, shells } = onionLayout(data.nodes, data.links);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  // scene
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1418');
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 400000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const light = new THREE.DirectionalLight(0xffffff, 0.6);
  light.position.set(1, 1, 1);
  scene.add(light);

  // containment shells: fresnel glass + faint fill + label
  const pickables = [];
  for (const s of shells) {
    const color = SHELL_COLORS[s.kind] || '#7c8f99';
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(s.radius, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) } },
        vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
        transparent: true, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    rim.position.set(s.center.x, s.center.y, s.center.z);
    rim.renderOrder = -1;
    rim.raycast = () => {};
    scene.add(rim);
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
    const label = makeTextSprite(byId.get(s.id)?.name || s.id.split('/').pop(), color);
    label.position.set(s.center.x, s.center.y + s.radius * 1.02, s.center.z);
    label.raycast = () => {};
    scene.add(label);
  }

  // nodes
  const nodeGeo = new THREE.SphereGeometry(1, 16, 12);
  for (const n of data.nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const r = (n.val || 0) ? 6 + 5 * Math.cbrt((n.val || 0) + 1) : 7;
    const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshLambertMaterial({
      color: NODE_COLORS[n.kind] || '#7c8f99', emissive: 0x11181c,
    }));
    mesh.scale.setScalar(Math.max(4, r));
    mesh.position.set(p.x, p.y, p.z);
    mesh.userData.node = n;
    scene.add(mesh);
    pickables.push(mesh);
  }

  // edges, grouped by type so colors survive
  const posById = pos;
  for (const [type, color] of Object.entries(EDGE_COLORS)) {
    const pts = [];
    for (const l of data.links) {
      if (l.type !== type) continue;
      const a = posById.get(l.source);
      const b = posById.get(l.target);
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

  // legend (shells + node kinds present)
  const kinds = [...new Set(data.nodes.map((n) => n.kind))];
  document.getElementById('legend').innerHTML =
    Object.entries(SHELL_COLORS).map(([k, c]) =>
      `<div><span class="dot" style="background:${c};opacity:.85"></span>${k.toLowerCase()} bubble</div>`).join('')
    + kinds.map((k) =>
      `<div><span class="dot" style="background:${NODE_COLORS[k] || '#7c8f99'}"></span>${k.toLowerCase()}</div>`).join('');

  // orbit controls (manual: drag rotates, wheel zooms, double-click flies)
  const maxShell = shells.reduce((a, s) => Math.max(a, s.radius), 600);
  let theta = 0.7, phi = 1.15, dist = maxShell * 3.0;
  const target = new THREE.Vector3(0, 0, 0);
  let drag = null;
  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (drag) {
      theta -= (e.clientX - drag.x) * 0.005;
      phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi - (e.clientY - drag.y) * 0.005));
      drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    }
  });
  dom.addEventListener('wheel', (e) => {
    dist = Math.min(maxShell * 8, Math.max(60, dist * (1 + e.deltaY * 0.001)));
    e.preventDefault();
  }, { passive: false });

  // picking: hover tooltip, click panel, double-click fly
  const raycaster = new THREE.Raycaster();
  const tooltip = document.getElementById('tooltip');
  const panel = document.getElementById('panel');
  const ndc = new THREE.Vector2();
  const nodeAt = (e) => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.node : null;
  };
  dom.addEventListener('pointermove', (e) => {
    const n = nodeAt(e);
    if (n) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
      tooltip.innerHTML = `<b>${n.name}</b> <span style="color:#7c8f99">${n.kind}</span>`;
      dom.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      dom.style.cursor = 'grab';
    }
  });
  const renderPanel = (n) => {
    const chain = [];
    let cur = n.id;
    const seen = new Set([cur]);
    for (const l of data.links) {
      if (CONT_LINKS.includes(l.type) && l.source === cur && !seen.has(l.target)) break;
    }
    // walk the containment chain upward
    const up = new Map();
    for (const l of data.links) {
      if (CONT_LINKS.includes(l.type) && !up.has(l.source)) up.set(l.source, l.target);
    }
    while (up.has(cur) && !seen.has(up.get(cur))) {
      cur = up.get(cur);
      seen.add(cur);
      chain.push(byId.get(cur)?.name || cur.split('/').pop());
    }
    const rels = [];
    for (const l of data.links) {
      if (l.source === n.id) rels.push(`${l.type} &#8594; ${byId.get(l.target)?.name || l.target.split('/').pop()}`);
      else if (l.target === n.id) rels.push(`${l.type} &#8592; ${byId.get(l.source)?.name || l.source.split('/').pop()}`);
    }
    panel.innerHTML = `
      <div class="kind">${n.kind}</div>
      <h2>${n.name}</h2>
      <div class="prov">provenance: ${n.provenance || '?'}</div>
      <div class="desc">${n.description || ''}</div>
      ${chain.length ? `<div class="section"><h3>Sits inside</h3><div>${chain.join(' &#8250; ')}</div></div>` : ''}
      ${rels.length ? `<div class="section"><h3>Relations (${rels.length})</h3><div>${rels.slice(0, 24).join('<br>')}</div></div>` : ''}
    `;
    panel.classList.add('visible');
  };
  let lastClick = 0;
  dom.addEventListener('click', (e) => {
    if (drag && drag.moved > 6) return;
    const n = nodeAt(e);
    const now = performance.now();
    if (n) {
      if (now - lastClick < 350) {
        const p = pos.get(n.id);
        if (p) { target.set(p.x, p.y, p.z); dist = Math.min(dist, maxShell * 0.35); }
      } else {
        renderPanel(n);
      }
      lastClick = now;
    } else {
      panel.classList.remove('visible');
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const frame = () => {
    camera.position.set(
      target.x + dist * Math.sin(phi) * Math.cos(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * Math.sin(phi) * Math.sin(theta));
    camera.lookAt(target);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  frame();
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#7c8f99">onion failed: ${err.message}</div>`);
});
