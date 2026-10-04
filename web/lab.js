/* Pyntology lab: renders a tape - the honest record of one real run of a
 * small Python program - as a laboratory experiment.
 *
 * Matter from physics: values are physical things with shape by type
 * (strings are helices, numbers are orbs). Motion from machinery: the
 * program is apparatus on a bench; print is an observation ring that
 * projects what it sees onto a screen and never transforms it.
 *
 * Design rules learned the hard way:
 *  - no figurative sculpture: every apparatus is a geometric glyph plus
 *    a label; the metaphor lives in motion, never in a fake instrument
 *  - matter is born at the statement plate that runs its line, then
 *    flows through the story: plate -> observer -> screen
 *  - the renderer never parses Python: every fact comes from the tape,
 *    and the scene at frame f is the fold of events 0..f (idempotent,
 *    so the playhead can scrub anywhere)
 */

const TYPE_COLORS = {
  str: '#4cc9f0', int: '#ffd166', float: '#ffd166', bool: '#ff5d8f',
  NoneType: '#7c8f99', unknown: '#7c8f99',
};

// the stage: where each element of the story lives (world units)
const STAGE = {
  plate: { x: -34, y: 9, z: 0 },     // the statement plate
  born: { x: -18, y: 9, z: 3 },      // matter materializes here
  ring: { x: 2, y: 11, z: 0 },      // the observer ring (print)
  parked: { x: 16, y: 9, z: 2 },    // matter after being observed
  screen: { x: 38, y: 18, z: -16 }, // the observation screen
};

const state = {
  tape: null, frame: -1, playing: false,
  shapes: new Map(),       // id -> {group, kind, fact, targetPos, born}
  codePlate: null, observer: null, screen: null, beam: null,
  powerRing: null, pickables: [],
  camera: null, target: null, dist: 170, theta: 0.7, phi: 1.15,
  flyTo: null, drag: null,
};

function makeTextSprite(text, color, size = 44) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${size}px -apple-system, Segoe UI, Roboto, sans-serif`;
  const w = Math.max(60, ctx.measureText(text).width + 30);
  canvas.width = w; canvas.height = size + 26;
  const c2 = canvas.getContext('2d');
  c2.font = `600 ${size}px -apple-system, Segoe UI, Roboto, sans-serif`;
  c2.fillStyle = color;
  c2.fillText(text, 15, size + 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  // labels are annotations, a fraction of the matter they describe
  sprite.scale.set(w * 0.07, (size + 26) * 0.07, 1);
  sprite.raycast = () => {};
  return sprite;
}

// ---- the matter ------------------------------------------------------

function buildHelix(fact) {
  const group = new THREE.Group();
  const text = fact.text ?? '';
  const len = fact.len ?? text.length;
  const color = TYPE_COLORS.str;
  // scale rule: short strings show every character as a bead on the
  // coil; long strings collapse the beads into a coiled cable
  const showBeads = len <= 40;
  const radius = 2.6;
  const turns = Math.max(2, len / 3.5);
  const length = Math.max(14, len * 2.0);
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(t * length - length / 2,
      radius * Math.cos(a), radius * Math.sin(a)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, 200, 0.55, 8, false),
    new THREE.MeshLambertMaterial({ color, emissive: 0x0c2229 })));
  if (showBeads) {
    for (let i = 0; i < len; i++) {
      const p = curve.getPointAt((i + 0.5) / len);
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 10, 8),
        new THREE.MeshLambertMaterial({ color: '#dff4ff', emissive: 0x223138 }));
      bead.position.copy(p);
      group.add(bead);
    }
  }
  const tag = makeTextSprite(fact.repr || `'${text}'`, color, 40);
  tag.position.set(0, radius + 6, 0);
  group.add(tag);
  return group;
}

function buildOrb(fact) {
  const group = new THREE.Group();
  const color = TYPE_COLORS[fact.type] || TYPE_COLORS.unknown;
  const mag = Math.abs(parseFloat(fact.repr)) || 1;
  const r = 4 + Math.min(8, Math.log2(mag + 1) * 2);
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 18),
    new THREE.MeshLambertMaterial({ color, emissive: 0x1a1a10 })));
  const tag = makeTextSprite(fact.repr, color, 40);
  tag.position.set(0, r + 5, 0);
  group.add(tag);
  return group;
}

// ---- the apparatus ---------------------------------------------------

function buildBench() {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.CylinderGeometry(44, 48, 5, 48),
    new THREE.MeshLambertMaterial({ color: 0x182329 }));
  slab.position.y = -2.5;
  group.add(slab);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(44, 0.8, 12, 64),
    new THREE.MeshLambertMaterial({ color: '#3ddc97', emissive: 0x0f3d29 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  group.add(ring);
  state.powerRing = ring;
  return group;
}

function buildCodePlate() {
  // the statement plate: what is executing, readable from the camera
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(24, 9, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x101c22 }));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 7.6),
    new THREE.MeshBasicMaterial({ transparent: true }));
  face.position.z = 0.7;
  group.add(plate);
  group.add(face);
  group.userData.face = face;
  group.position.set(STAGE.plate.x, STAGE.plate.y, STAGE.plate.z);
  group.rotation.y = 0.35;
  return group;
}

function codePlateTexture(lineNo, code) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 176;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101c22';
  ctx.fillRect(0, 0, 512, 176);
  ctx.font = '600 26px "SF Mono", Menlo, Consolas, monospace';
  ctx.fillStyle = '#7c8f99';
  ctx.fillText(`line ${lineNo}`, 20, 44);
  ctx.fillStyle = '#5cf1b4';
  const short = code.length > 40 ? code.slice(0, 39) + '…' : code;
  ctx.fillText(short, 20, 108);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildObserver() {
  // the observation ring: print as a geometric glyph, never a sculpture.
  // What passes through it is projected, not transformed.
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.3, 11, 10),
    new THREE.MeshLambertMaterial({ color: 0x3a4a52 }));
  post.position.set(0, -5.5, 0);
  group.add(post);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5.5, 1.0, 14, 48),
    new THREE.MeshLambertMaterial({ color: '#9fb8c4', emissive: 0x1c2830 }));
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  const label = makeTextSprite('print', '#5cf1b4', 36);
  label.position.set(0, 9, 0);
  group.add(label);
  group.position.set(STAGE.ring.x, STAGE.ring.y, STAGE.ring.z);
  return group;
}

function buildScreen() {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(30, 18, 1.5),
    new THREE.MeshLambertMaterial({ color: 0x182329 }));
  group.add(frame);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(27, 15.4),
    new THREE.MeshBasicMaterial({ color: 0x0b1013 }));
  face.position.z = 0.9;
  group.add(face);
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(25.5, 14),
    new THREE.MeshBasicMaterial({ transparent: true }));
  textPlane.position.z = 1.0;
  group.add(textPlane);
  group.userData.textPlane = textPlane;
  group.userData.face = face;
  group.position.set(STAGE.screen.x, STAGE.screen.y, STAGE.screen.z);
  group.rotation.y = -0.32;
  return group;
}

function screenTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1013';
  ctx.fillRect(0, 0, 640, 360);
  ctx.font = '600 26px "SF Mono", Menlo, Consolas, monospace';
  ctx.fillStyle = '#5cf1b4';
  const lines = (text || '').replace(/\n$/, '').split('\n');
  lines.slice(0, 9).forEach((line, idx) => {
    ctx.fillText(line.length > 46 ? line.slice(0, 45) + '…' : line, 24, 44 + idx * 34);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildBeam() {
  // a visible light cone: observer -> screen, alive while observing
  const a = new THREE.Vector3(STAGE.ring.x, STAGE.ring.y, STAGE.ring.z);
  const b = new THREE.Vector3(STAGE.screen.x, STAGE.screen.y, STAGE.screen.z);
  const dir = new THREE.Vector3().subVectors(b, a);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(0.6, 2.4, dir.length(), 12, 1, true);
  const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#5cf1b4', transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  beam.position.copy(mid);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  beam.visible = false;
  return beam;
}

// ---- the fold: scene state from events 0..f --------------------------

function eventCaption(ev) {
  switch (ev.kind) {
    case 'start': return 'the experiment powers on';
    case 'end': return `the experiment ends — exit code ${ev.code}`;
    case 'call_enter':
      return ev.func === '<module>' ? 'the module loads: the bench goes live'
        : `machine ${ev.func} starts`;
    case 'call_return':
      return ev.func === '<module>' ? 'the module finishes'
        : `${ev.func} returns ${ev.value?.repr ?? ''}`;
    case 'line': return `line ${ev.line}: <code>${ev.code || ''}</code>`;
    case 'assign':
      return `${ev.name} = ${ev.value?.repr ?? ''}  (bound in ${ev.scope})`;
    case 'output': return `the observer projects: <code>${(ev.text || '').replace(/\n$/, '')}</code>`;
    case 'exception':
      return `alarm: ${ev.exc} — ${ev.text || ''}${ev.uncaught ? ' (uncaught, the experiment dies)' : ''}`;
    default: return ev.kind;
  }
}

function applyFrame(f) {
  const events = state.tape.events.slice(0, f + 1);
  const started = events.some((e) => e.kind === 'start');
  const ended = events.some((e) => e.kind === 'end');
  state.powerRing.material.emissive.setHex(
    ended ? 0x0f2018 : started ? 0x2d8f5f : 0x0f2029);

  // the statement plate shows the last line that ran
  const lines = events.filter((e) => e.kind === 'line');
  state.codePlate.userData.face.material.map =
    lines.length ? codePlateTexture(lines[lines.length - 1].line,
      lines[lines.length - 1].code) : null;
  state.codePlate.userData.face.material.needsUpdate = true;
  state.codePlate.visible = lines.length > 0;

  // matter: born at the plate when its line runs; once an observation
  // happened after its birth, it has flowed through the ring and parks
  const firstOutputAfter = (lineIdx) => {
    const out = events.find((e) => e.kind === 'output');
    return out !== undefined && out.i > lineIdx ? out : null;
  };
  let slot = 0;
  const seen = new Set();
  for (const ev of events) {
    if (ev.kind !== 'line') continue;
    for (const fact of ev.consts || []) {
      const id = `matter:${ev.line}:${slot}`;
      slot++;
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = materialize(id, fact, slot - 1);
      const observed = firstOutputAfter(events.indexOf(ev));
      const base = observed ? STAGE.parked : STAGE.born;
      entry.targetPos = new THREE.Vector3(
        base.x, base.y + (slot - 1 > 2 ? (slot - 3) * 2 : 0), base.z);
    }
  }

  // observation: everything printed so far, on the screen
  const observed = events.filter((e) => e.kind === 'output')
    .map((e) => e.text).join('');
  state.screen.userData.textPlane.material.map = screenTexture(observed);
  state.screen.userData.face.material.color.setHex(observed ? 0x0b2018 : 0x0b1013);
}

function materialize(id, fact, slotIndex) {
  if (state.shapes.has(id)) return state.shapes.get(id);
  const group = fact.type === 'str' ? buildHelix(fact) : buildOrb(fact);
  group.position.set(STAGE.born.x, STAGE.born.y, STAGE.born.z);
  scene.add(group);
  const entry = { group, kind: 'matter', fact,
    targetPos: new THREE.Vector3(STAGE.born.x, STAGE.born.y, STAGE.born.z) };
  group.traverse((o) => { o.userData.pick = entry; });
  state.shapes.set(id, entry);
  state.pickables.push(group);
  entry.group.scale.setScalar(0.01);
  entry.born = performance.now();
  return entry;
}

// ---- playback ---------------------------------------------------------

function setFrame(f, { pulses = false } = {}) {
  state.frame = f;
  applyFrame(f);
  document.getElementById('scrub').value = f;
  document.getElementById('counter').textContent = `${f + 1} / ${state.tape.events.length}`;
  const cap = document.getElementById('caption');
  const ev = state.tape.events[f];
  cap.innerHTML = ev ? eventCaption(ev) : '&nbsp;';
  if (pulses && ev) {
    if (ev.kind === 'output') {
      state.beam.visible = true;
      state.beam.userData.until = performance.now() + 1800;
    }
  }
}

async function playLoop() {
  state.playing = true;
  const btn = document.getElementById('play');
  btn.textContent = 'Pause';
  while (state.playing && state.frame < state.tape.events.length - 1) {
    setFrame(state.frame + 1, { pulses: true });
    const ev = state.tape.events[state.frame];
    await new Promise((r) => setTimeout(r, ev.kind === 'line' ? 1600 : 1100));
  }
  state.playing = false;
  btn.textContent = 'Play';
}

// ---- inspector ---------------------------------------------------------

function renderPanel(entry) {
  const panel = document.getElementById('panel');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = '';
  if (entry.kind === 'matter') {
    const fact = entry.fact;
    html = `
      <div class="kind">${fact.type} matter</div>
      <h2>${esc(fact.repr || '')}</h2>
      <div class="desc">A value that exists while this line runs. Its
      shape is its type; its size is its magnitude. Observation does not
      transform it.</div>
      <div class="fact">type: ${fact.type}${fact.len !== undefined ? `\nlength: ${fact.len} characters` : ''}</div>
      <div class="fact">value: ${esc(fact.text ?? fact.repr ?? '')}</div>`;
  } else if (entry.kind === 'screen') {
    const observed = state.tape.events.slice(0, state.frame + 1)
      .filter((e) => e.kind === 'output').map((e) => e.text).join('');
    html = `
      <div class="kind">observation screen</div>
      <h2>the print projection</h2>
      <div class="desc">print projects matter onto this screen. The
      projection is a readout, not the matter: the string on the bench is
      untouched.</div>
      <div class="fact">${esc(observed || '(nothing observed yet at this frame)')}</div>`;
  } else if (entry.kind === 'observer') {
    html = `
      <div class="kind">observation ring</div>
      <h2>print</h2>
      <div class="desc">What passes through the ring is observed and
      projected onto the screen. Observed, never transformed.</div>`;
  } else if (entry.kind === 'bench') {
    const endEv = state.tape.events.find((e) => e.kind === 'end');
    html = `
      <div class="kind">experiment bench</div>
      <h2>${esc(state.tape.program)}</h2>
      <div class="desc">One program, one experiment. The ring is the power
      line: it lights when the module loads and dims when the run ends.</div>
      <div class="fact">status: ${endEv && state.frame >= endEv.i
        ? `finished, exit code ${endEv.code}` : state.frame >= 0 ? 'running' : 'not started'}
recorded on: CPython ${esc(state.tape.python)}</div>`;
  }
  panel.innerHTML = html;
  panel.classList.add('visible');
}

// ---- the scene ---------------------------------------------------------

let scene;

async function main() {
  const tape = window.PYNT_TAPE
    ? JSON.parse(window.PYNT_TAPE)
    : await (await fetch(
        new URLSearchParams(location.search).get('tape') || 'tapes/01_hello.json',
      )).json();
  state.tape = tape;
  document.getElementById('lesson-name').textContent = `lesson: ${tape.program}`;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1418');
  scene.fog = new THREE.Fog(0x0d1418, 300, 900);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
  state.camera = camera;
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(60, 90, 40);
  scene.add(key);

  const floor = new THREE.GridHelper(600, 60, 0x23323a, 0x17222a);
  floor.position.y = -30;
  scene.add(floor);

  // the story, left to right: plate -> born -> ring -> parked -> screen
  state.bench = buildBench();
  scene.add(state.bench);
  state.bench.traverse((o) => { o.userData.pick = { kind: 'bench' }; });
  state.pickables.push(state.bench);

  state.codePlate = buildCodePlate();
  scene.add(state.codePlate);
  state.codePlate.traverse((o) => { o.userData.pick = o.userData.pick || { kind: 'bench' }; });

  state.observer = buildObserver();
  scene.add(state.observer);
  state.observer.traverse((o) => { o.userData.pick = o.userData.pick || { kind: 'observer' }; });
  state.pickables.push(state.observer);

  state.screen = buildScreen();
  scene.add(state.screen);
  state.screen.traverse((o) => { o.userData.pick = o.userData.pick || { kind: 'screen' }; });
  state.pickables.push(state.screen);
  const screenLabel = makeTextSprite('observation screen', '#5cf1b4', 36);
  screenLabel.position.set(STAGE.screen.x, STAGE.screen.y + 14, STAGE.screen.z);
  scene.add(screenLabel);

  state.beam = buildBeam();
  scene.add(state.beam);

  const benchLabel = makeTextSprite(tape.program, '#3ddc97', 40);
  benchLabel.position.set(0, 12, 52);
  scene.add(benchLabel);

  // navigation: orbit, pan, zoom
  const target = new THREE.Vector3(0, 8, 0);
  state.target = target;
  const dom = renderer.domElement;
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.addEventListener('pointerdown', (e) => {
    state.drag = { x: e.clientX, y: e.clientY, moved: 0,
                   pan: e.button === 2 || e.shiftKey };
    state.flyTo = null;
  });
  window.addEventListener('pointerup', () => { state.drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!state.drag) return;
    const dx = e.clientX - state.drag.x;
    const dy = e.clientY - state.drag.y;
    state.drag.moved += Math.abs(dx) + Math.abs(dy);
    state.drag.x = e.clientX; state.drag.y = e.clientY;
    if (state.drag.pan) {
      const k = state.dist * 0.0016;
      const view = new THREE.Vector3().subVectors(target, camera.position).normalize();
      const right = new THREE.Vector3().crossVectors(view, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, view).normalize();
      target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    } else {
      state.theta -= dx * 0.005;
      state.phi = Math.min(Math.PI - 0.05, Math.max(0.05, state.phi - dy * 0.005));
    }
  });
  dom.addEventListener('wheel', (e) => {
    state.flyTo = null;
    state.dist = Math.min(700, Math.max(30, state.dist * (1 + e.deltaY * 0.001)));
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // picking: click anything to inspect it at this exact frame
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  dom.addEventListener('click', (e) => {
    if (state.drag && state.drag.moved > 6) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(state.pickables, true);
    if (hits.length && hits[0].object.userData.pick) {
      renderPanel(hits[0].object.userData.pick);
    } else {
      document.getElementById('panel').classList.remove('visible');
    }
  });

  // timeline controls
  const scrub = document.getElementById('scrub');
  scrub.max = tape.events.length - 1;
  scrub.addEventListener('input', () => {
    state.playing = false;
    document.getElementById('play').textContent = 'Play';
    setFrame(parseInt(scrub.value, 10));
  });
  document.getElementById('play').addEventListener('click', () => {
    if (state.playing) {
      state.playing = false;
      document.getElementById('play').textContent = 'Play';
    } else {
      if (state.frame >= tape.events.length - 1) setFrame(0);
      playLoop();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); document.getElementById('play').click(); }
    if (e.key === 'Escape') document.getElementById('panel').classList.remove('visible');
    if (e.key === 'ArrowRight') scrub.value = Math.min(tape.events.length - 1, state.frame + 1);
    if (e.key === 'ArrowLeft') scrub.value = Math.max(0, state.frame - 1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      state.playing = false;
      document.getElementById('play').textContent = 'Play';
      setFrame(parseInt(scrub.value, 10));
    }
  });

  setFrame(0);

  // animation loop: eased flight, matter growing and gliding to its
  // fold position (scrub-safe: the target is always fold-derived)
  const frame = () => {
    const now = performance.now();
    if (state.flyTo) {
      const goal = state.flyTo;
      target.lerp(goal, 0.08);
      state.dist += (goal.dist - state.dist) * 0.08;
      if (target.distanceTo(goal) < 0.5) state.flyTo = null;
    }
    for (const entry of state.shapes.values()) {
      if (entry.born !== undefined) {
        const age = now - entry.born;
        const s = Math.min(1, age / 700);
        entry.group.scale.setScalar(0.01 + 0.99 * (1 - Math.pow(1 - s, 3)));
        if (s >= 1) delete entry.born;
      }
      entry.group.position.lerp(entry.targetPos, 0.06);
    }
    if (state.beam.visible && state.beam.userData.until
        && now > state.beam.userData.until) {
      state.beam.visible = false;
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
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#7c8f99">lab failed: ${err.message}</div>`);
});
