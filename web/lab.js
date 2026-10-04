/* Pyntology lab: renders a tape - the honest record of one real run of a
 * small Python program - as boxes, pipes and flowing matter.
 *
 * The design contract (settled with the user, lesson 1):
 *  - boxes are lines of code: the code is readable on the box face;
 *    boxes sit in the room in reading order
 *  - pipes carry balls: a value born from a line's literal is a ball
 *    that flows through a visible pipe into the box that consumes it;
 *    transit glows, arrival lands
 *  - the working box is the playhead: execution is which box's pipes
 *    are active. Nothing moves that isn't matter going somewhere.
 *  - the renderer never parses Python: every visual fact comes from the
 *    tape, and the scene at frame f is the fold of events 0..f
 *    (idempotent, so the playhead can scrub anywhere)
 */

const TYPE_COLORS = {
  str: '#4cc9f0', int: '#ffd166', float: '#ffd166', bool: '#ff5d8f',
  NoneType: '#7c8f99', unknown: '#7c8f99',
};

const FLOW = '#5cf1b4';

const state = {
  tape: null, frame: -1, playing: false,
  boxes: new Map(),        // line -> {group, ev}
  chambers: new Map(),     // func -> the function machine that was called
  matter: new Map(),       // id -> {group, kind: 'matter', fact, line, targetPos}
  cone: null, wall: null, wallLines: 0, floor: null,
  scan: null,              // the beam sweep: {mesh, t0, x}
  ghosts: [],               // after-images proving no mutation: {mesh, t0}
  wisps: [],                // return values flowing out: {mesh, t0, x}
  pickables: [],
  camera: null, target: null, dist: 170, theta: 0.7, phi: 1.15,
  flyTo: null, drag: null,
};

// ---- geometry helpers -------------------------------------------------

function boxX(index) {
  // boxes sit in the room in reading order, left to right
  return -40 + index * 36;
}

function codeTexture(lineNo, code) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101c22';
  ctx.fillRect(0, 0, 512, 160);
  ctx.font = '600 24px "SF Mono", Menlo, Consolas, monospace';
  ctx.fillStyle = '#7c8f99';
  ctx.fillText(`line ${lineNo}`, 22, 40);
  ctx.fillStyle = '#5cf1b4';
  const short = code.length > 42 ? code.slice(0, 41) + '…' : code;
  ctx.fillText(short, 22, 96);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildLineBox(index, lineNo, code) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(26, 9, 11),
    new THREE.MeshLambertMaterial({ color: 0x182329 }));
  group.add(body);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 7.4),
    new THREE.MeshBasicMaterial({ transparent: true }));
  face.position.z = 5.7;
  group.add(face);
  group.userData.face = face;
  group.userData.body = body;
  group.userData.line = lineNo;
  group.userData.code = code;
  group.position.set(boxX(index), 12, 0);
  return group;
}

function buildBall(fact) {
  // matter in transit: a ball whose identity lives in hover and click.
  // Strings can be cracked open later; for now the ball IS the value.
  const group = new THREE.Group();
  const color = TYPE_COLORS[fact.type] || TYPE_COLORS.unknown;
  const r = fact.type === 'str' ? 3.4 : 3;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(r, 20, 16),
    new THREE.MeshLambertMaterial({ color, emissive: 0x14222a }));
  group.add(ball);
  group.userData.ball = ball;
  return group;
}

function buildChamber(x, func) {
  // a function is a machine you call: a glass chamber with an argument
  // aperture on top and a return exhaust at the bottom. Matter goes in,
  // the machine works, what it returns comes out - for print that is
  // None, a gray wisp. The statement box is the code; the chamber is
  // the function itself, docking above the line that calls it.
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 9, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x27404d, transparent: true,
      opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  group.add(body);
  const aperture = new THREE.Mesh(
    new THREE.TorusGeometry(3.7, 0.7, 14, 40),
    new THREE.MeshLambertMaterial({ color: '#9fb8c4', emissive: 0x1c2830 }));
  aperture.rotation.x = Math.PI / 2;
  aperture.position.y = 4.5;
  group.add(aperture);
  const exhaust = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.45, 12, 32),
    new THREE.MeshLambertMaterial({ color: 0x3a4a52 }));
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.y = -4.5;
  group.add(exhaust);
  group.position.set(x, 20, 0);
  return { group, body, aperture, exhaust, func, x, until: 0, scanning: 0 };
}

function buildCone(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(0.6, 3.0, dir.length(), 12, 1, true);
  const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: FLOW, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  cone.position.copy(mid);
  cone.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  cone.visible = false;
  return cone;
}

function buildWall() {
  // the display wall: output history is a physical place. Every print
  // adds a line strip to it, top to bottom, that stays - walk along it
  // and you walk the program's output.
  const group = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(58, 40, 2),
    new THREE.MeshLambertMaterial({ color: 0x141d24 }));
  group.add(slab);
  group.position.set(36, 24, -46);
  group.rotation.y = -0.35;
  return group;
}

function lineTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1418';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = '600 44px "SF Mono", Menlo, Consolas, monospace';
  ctx.fillStyle = FLOW;
  const line = (text || '').replace(/\n$/, '');
  ctx.fillText(line.length > 40 ? line.slice(0, 39) + '…' : line, 20, 84);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function addWallLine(wall, text, index) {
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 6.2),
    new THREE.MeshBasicMaterial({ map: lineTexture(text), transparent: true }));
  strip.position.set(0, 15 - index * 7, 1.2);
  wall.add(strip);
  return strip;
}

// ---- the fold: scene state from events 0..f --------------------------

function eventCaption(ev) {
  switch (ev.kind) {
    case 'start': return 'the program starts';
    case 'end': return `the program ends — exit code ${ev.code}`;
    case 'call_enter':
      return ev.func === '<module>' ? 'the module loads'
        : `${ev.func} is called${ev.args?.length
          ? ` with ${(ev.args || []).map((a) => a.repr).join(', ')}` : ''}`;
    case 'call_return':
      return ev.func === '<module>' ? 'the module finishes'
        : `${ev.func} returns ${ev.value?.repr ?? 'None'}`;
    case 'line': return `line ${ev.line}: <code>${ev.code || ''}</code>`;
    case 'assign':
      return `${ev.name} = ${ev.value?.repr ?? ''}  (bound in ${ev.scope})`;
    case 'output': return `print observes — the wall shows the value as text: <code>${(ev.text || '').replace(/\n$/, '')}</code>`;
    case 'exception':
      return `alarm: ${ev.exc} — ${ev.text || ''}${ev.uncaught ? ' (uncaught, the program dies)' : ''}`;
    default: return ev.kind;
  }
}

function applyFrame(f) {
  const events = state.tape.events.slice(0, f + 1);

  // boxes: one per executed line, in reading order; rewinding before a
  // line's execution hides its box again
  const executed = [];
  const seenLines = new Set();
  for (const ev of events) {
    if (ev.kind === 'line' && !seenLines.has(ev.line)) {
      seenLines.add(ev.line);
      executed.push(ev);
    }
  }
  executed.forEach((ev, index) => {
    const id = ev.line;
    if (!state.boxes.has(id)) {
      const group = buildLineBox(index, ev.line, ev.code);
      group.userData.face.material.map = codeTexture(ev.line, ev.code);
      scene.add(group);
      group.userData.pick = { kind: 'box', line: ev.line, code: ev.code };
      group.traverse((o) => { o.userData.pick = o.userData.pick || group.userData.pick; });
      state.pickables.push(group);
      state.boxes.set(id, { group, ev });
    }
  });
  for (const [line, box] of state.boxes) {
    box.group.visible = seenLines.has(line);
  }

  // chambers: a function machine docks above the line that calls it;
  // one chamber per function, however many times it is called
  const calledFuncs = new Set();
  for (const ev of events) {
    if (ev.kind !== 'call_enter' || ev.func === '<module>') continue;
    calledFuncs.add(ev.func);
    if (state.chambers.has(ev.func)) continue;
    const callerLine = [...events.slice(0, ev.i)].reverse()
      .find((e) => e.kind === 'line');
    const index = executed.findIndex((e) => e.line === callerLine?.line);
    const chamber = buildChamber(boxX(index < 0 ? 0 : index), ev.func);
    chamber.group.traverse((o) => {
      o.userData.pick = o.userData.pick || { kind: 'chamber', func: ev.func };
    });
    scene.add(chamber.group);
    state.pickables.push(chamber.group);
    state.chambers.set(ev.func, chamber);
  }
  for (const [func, chamber] of state.chambers) {
    chamber.group.visible = calledFuncs.has(func);
  }

  // matter: balls born above the aperture of the chamber their line
  // calls; once observed, they rest inside the chamber, unchanged
  let slot = 0;
  const seen = new Set();
  for (const ev of events) {
    if (ev.kind !== 'line') continue;
    for (const fact of ev.consts || []) {
      const id = `matter:${ev.line}:${slot}`;
      slot++;
      if (seen.has(id)) continue;
      seen.add(id);
      const index = executed.findIndex((e) => e.line === ev.line);
      const x = boxX(index);
      const entry = materialize(id, fact, ev.line, x);
      const observed = events.find((e) => e.kind === 'output');
      entry.targetPos = new THREE.Vector3(x, observed ? 20 : 29, 0);
    }
  }
  for (const [id, entry] of state.matter) {
    const vis = seen.has(id);
    // re-birth snaps: nothing ever eases out of a box it previously
    // rested in - becoming visible again places matter at its fold spot
    if (vis && !entry.group.visible) {
      entry.group.position.copy(entry.targetPos);
    }
    entry.group.visible = vis;
  }

  // observation: every output event adds a physical line to the wall;
  // rewinding before a print removes its line again (the wall obeys
  // the fold like everything else)
  const outputCount = events.filter((e) => e.kind === 'output').length;
  events.filter((e) => e.kind === 'output').forEach((ev, index) => {
    if (index >= state.wallLines) {
      addWallLine(state.wall, ev.text, index);
      state.wallLines = index + 1;
    }
  });
  state.wall.children.forEach((child, i) => {
    if (child !== state.wall.children[0]) child.visible = (i - 1) < outputCount;
  });
}

function materialize(id, fact, line, x) {
  if (state.matter.has(id)) return state.matter.get(id);
  const group = buildBall(fact);
  group.position.set(x, 29, 0);
  scene.add(group);
  const entry = { group, kind: 'matter', fact, line,
    targetPos: new THREE.Vector3(x, 29, 0) };
  group.traverse((o) => { o.userData.pick = entry; });
  state.matter.set(id, entry);
  state.pickables.push(group);
  entry.group.scale.setScalar(0.01);
  entry.born = performance.now();
  return entry;
}

// ---- playback ---------------------------------------------------------

function setFrame(f, { pulses = false } = {}) {
  state.frame = f;
  applyFrame(f);
  if (!pulses) {
    // rewinding is not motion: scrubbing or restarting snaps matter to
    // its fold position instead of easing it backwards through pipes
    for (const entry of state.matter.values()) {
      entry.group.position.copy(entry.targetPos);
    }
  }
  document.getElementById('scrub').value = f;
  document.getElementById('counter').textContent = `${f + 1} / ${state.tape.events.length}`;
  const cap = document.getElementById('caption');
  const ev = state.tape.events[f];
  cap.innerHTML = ev ? eventCaption(ev) : '&nbsp;';
  if (pulses && ev) {
    const now = performance.now();
    if (ev.kind === 'line') {
      // the working box lights up
      const box = state.boxes.get(ev.line);
      if (box) {
        box.group.userData.body.material.emissive.setHex(0x2d8f5f);
        box.group.userData.working = now + 1500;
      }
    }
    if (ev.kind === 'call_enter' && ev.func !== '<module>') {
      // the function machine docks, alive
      const chamber = state.chambers.get(ev.func);
      if (chamber) {
        chamber.group.scale.setScalar(0.01);
        chamber.born = now;
        chamber.until = now + 2000;
      }
    }
    if (ev.kind === 'output') {
      // matter drops through the aperture: the beam sweeps over it,
      // the readout projects to the wall, the ball rests unchanged
      state.cone.visible = true;
      state.cone.userData.until = now + 1800;
      const chamber = [...state.chambers.values()]
        .find((c) => c.group.visible);
      if (chamber) {
        state.scan.t0 = now;
        state.scan.x = chamber.x;
        chamber.scanning = now + 1600;
      }
      // the identity ghost: a translucent copy of the observed matter
      // pinned at the aperture, fading - what went in = what came out
      for (const entry of state.matter.values()) {
        if (entry.observed || !entry.group.visible) continue;
        entry.observed = true;
        const ghost = new THREE.Mesh(
          entry.group.children[0].geometry,
          new THREE.MeshBasicMaterial({
            color: TYPE_COLORS[entry.fact.type] || TYPE_COLORS.unknown,
            transparent: true, opacity: 0.4, depthWrite: false,
          }));
        ghost.position.set(entry.targetPos.x, 24.5, 0);
        ghost.raycast = () => {};
        scene.add(ghost);
        state.ghosts.push({ mesh: ghost, t0: now });
        break;
      }
    }
    if (ev.kind === 'call_return' && ev.func !== '<module>') {
      // what the function returns flows out of the exhaust: for print
      // that is None - a gray wisp that falls and dissolves
      const chamber = state.chambers.get(ev.func);
      if (chamber) {
        const wisp = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 12, 10),
          new THREE.MeshBasicMaterial({
            color: TYPE_COLORS.NoneType, transparent: true, opacity: 0.8,
            depthWrite: false,
          }));
        wisp.position.set(chamber.x, 15.5, 0);
        wisp.raycast = () => {};
        scene.add(wisp);
        state.wisps.push({ mesh: wisp, t0: now, x: chamber.x });
      }
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

function resetRun() {
  state.playing = false;
  document.getElementById('play').textContent = 'Play';
  // kill every transient effect: no sweep, no ghosts, no wisps, no cone,
  // no chamber glow
  state.scan.t0 = -1e9;
  state.scan.mesh.visible = false;
  for (const g of state.ghosts) {
    scene.remove(g.mesh);
    g.mesh.material.dispose();
  }
  state.ghosts.length = 0;
  for (const w of state.wisps) {
    scene.remove(w.mesh);
    w.mesh.material.dispose();
  }
  state.wisps.length = 0;
  state.cone.visible = false;
  for (const chamber of state.chambers.values()) {
    chamber.until = 0;
    chamber.scanning = 0;
  }
  setFrame(0);
}

// ---- inspector ---------------------------------------------------------

function hoverName(entry) {
  switch (entry.kind) {
    case 'matter': return entry.fact.repr || entry.fact.type;
    case 'screen': return 'stdout';
    case 'chamber': return entry.func;
    case 'box': return `line ${entry.line}`;
    case 'floor': return state.tape.program;
    default: return '?';
  }
}

function hoverKind(entry) {
  switch (entry.kind) {
    case 'matter': return entry.fact.type;
    case 'screen': return 'output of print';
    case 'chamber': return 'builtin function';
    case 'box': return 'statement';
    case 'floor': return 'module';
    default: return '';
  }
}

function renderPanel(entry) {
  const panel = document.getElementById('panel');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = '';
  if (entry.kind === 'matter') {
    const fact = entry.fact;
    const whatItDoes = {
      str: 'A str is text: a sequence of characters, in order.',
      int: 'An int is a whole number.',
      float: 'A float is a number with a decimal point.',
      bool: 'A bool is True or False.',
    }[fact.type] || '';
    html = `
      <div class="kind">${fact.type}</div>
      <h2>${esc(fact.repr || '')}</h2>
      <div class="desc">${whatItDoes} This one was born at line
      ${entry.line ?? '?'} when that line ran.</div>
      <div class="fact">type: ${fact.type}${fact.len !== undefined ? `\nlength: ${fact.len}` : ''}${fact.type === 'str' ? ' characters' : ''}</div>
      <div class="fact">value: ${esc(fact.text ?? fact.repr ?? '')}</div>`;
  } else if (entry.kind === 'screen') {
    const observed = state.tape.events.slice(0, state.frame + 1)
      .filter((e) => e.kind === 'output');
    html = `
      <div class="kind">stdout</div>
      <h2>the display wall</h2>
      <div class="desc">stdout is Python's standard output stream; the
      wall accumulates one line per print, in order - the program's
      output history as a place you can walk along. What you see on it
      is <code>str(value)</code>, the value's string representation,
      not the value itself.</div>
      <div class="fact">lines on the wall at this frame: ${observed.length}</div>`;
  } else if (entry.kind === 'chamber') {
    const calls = state.tape.events.slice(0, state.frame + 1)
      .filter((e) => e.kind === 'call_enter' && e.func === entry.func);
    const rets = state.tape.events.slice(0, state.frame + 1)
      .filter((e) => e.kind === 'call_return' && e.func === entry.func);
    html = `
      <div class="kind">builtin function</div>
      <h2>${esc(entry.func)}</h2>
      <div class="desc">A function is a machine you call: matter goes in
      through the aperture, the machine does its work, and what it
      returns comes out of the exhaust. print's work is projecting text
      to the wall - it never transforms its argument, and it returns
      None: nothing comes back to you.</div>
      <div class="fact">in this run so far: called ${calls.length} time${calls.length === 1 ? '' : 's'}${calls.length
        ? `, with ${(calls[calls.length - 1].args || []).map((a) => a.repr).join(', ')}`
        : ''}${rets.length ? `\nreturned: ${rets[0].value?.repr ?? 'None'}` : ''}</div>`;
  } else if (entry.kind === 'box') {
    html = `
      <div class="kind">statement</div>
      <h2>line ${entry.line}</h2>
      <div class="desc">Python runs a file top to bottom, one line at a
      time; each line is a box in the room, in reading order. Values are
      born inside the box of the line that creates them.</div>
      <div class="fact">${esc(entry.code)}</div>`;
  } else if (entry.kind === 'floor') {
    const endEv = state.tape.events.find((e) => e.kind === 'end');
    html = `
      <div class="kind">module</div>
      <h2>${esc(state.tape.program)}</h2>
      <div class="desc">A module is a Python file: running it executes
      the whole file, top to bottom.</div>
      <div class="fact">status: ${endEv && state.frame >= endEv.i
        ? `finished, exit code ${endEv.code}` : state.frame >= 0 ? 'running' : 'not started'}
interpreter: CPython ${esc(state.tape.python)}
lines: ${state.tape.lines.length}</div>`;
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
  scene.fog = new THREE.Fog(0x0d1418, 320, 950);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
  state.camera = camera;
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(60, 90, 40);
  scene.add(key);

  // the room: the floor is the module; boxes (lines) arrive with the tape
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(120, 120, 2, 64),
    new THREE.MeshLambertMaterial({ color: 0x121a20 }));
  floor.position.y = -1;
  scene.add(floor);
  const grid = new THREE.GridHelper(600, 60, 0x23323a, 0x17222a);
  grid.position.y = -10;
  scene.add(grid);
  state.floor = floor;
  floor.userData.pick = { kind: 'floor' };
  state.pickables.push(floor);

  // the display wall: output history is a physical place to walk along
  state.wall = buildWall();
  scene.add(state.wall);
  state.wall.userData.pick = { kind: 'screen' };
  state.wall.traverse((o) => { o.userData.pick = o.userData.pick || { kind: 'screen' }; });
  state.pickables.push(state.wall);

  // the projection cone: from the function chamber to the wall's
  // current line
  state.cone = buildCone(
    new THREE.Vector3(boxX(0), 19, 0),
    new THREE.Vector3(30, 30, -44));
  scene.add(state.cone);

  // the beam sweep: a scanner ring that travels down the channel,
  // crossing the matter once per observation
  state.scan = { t0: -1e9, x: boxX(0), mesh: null };
  state.scan.mesh = new THREE.Mesh(
    new THREE.TorusGeometry(5.6, 0.28, 10, 48),
    new THREE.MeshBasicMaterial({
      color: FLOW, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  state.scan.mesh.rotation.x = Math.PI / 2;
  state.scan.mesh.visible = false;
  scene.add(state.scan.mesh);

  // navigation: orbit, pan, zoom
  const target = new THREE.Vector3(-20, 10, 0);
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

  // hover names things; click inspects them at this exact frame
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tooltip = document.getElementById('tooltip');
  dom.addEventListener('pointermove', (e) => {
    if (state.drag && state.drag.moved > 2) { tooltip.style.display = 'none'; return; }
    ndc.set((e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(state.pickables, true);
    const hit = hits.length ? hits[0].object.userData.pick : null;
    if (hit) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
      tooltip.innerHTML = `<b>${hoverName(hit)}</b> <span style="color:#7c8f99">${hoverKind(hit)}</span>`;
      dom.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      dom.style.cursor = 'grab';
    }
  });
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
  // reset: a pristine experiment - frame 0, no transient effects, so
  // nothing from a previous run lingers or rematerializes
  document.getElementById('reset').addEventListener('click', resetRun);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' ) { e.preventDefault(); document.getElementById('play').click(); }
    if (e.key === 'r' || e.key === 'R') resetRun();
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

  // animation loop: matter eases toward its fold-derived position, the
  // working box glows, pipes and cone fade after their windows
  const frame = () => {
    const now = performance.now();
    if (state.flyTo) {
      const goal = state.flyTo;
      target.lerp(goal, 0.08);
      state.dist += (goal.dist - state.dist) * 0.08;
      if (target.distanceTo(goal) < 0.5) state.flyTo = null;
    }
    for (const entry of state.matter.values()) {
      if (entry.born !== undefined) {
        const age = now - entry.born;
        const s = Math.min(1, age / 700);
        entry.group.scale.setScalar(0.01 + 0.99 * (1 - Math.pow(1 - s, 3)));
        if (s >= 1) delete entry.born;
      }
      entry.group.position.lerp(entry.targetPos, 0.07);
      // observed matter is NEVER dimmed or recolored: what exits the
      // lens is exactly what entered
    }
    for (const box of state.boxes.values()) {
      const body = box.group.userData.body;
      if (!box.group.userData.working || now > box.group.userData.working) {
        body.material.emissive.setHex(0x0a1014);
      }
    }
    // the beam sweep: the scanner ring travels down through the
    // chamber over ~0.9s, bright at the crossings, gone when it exits
    const scanAge = now - state.scan.t0;
    if (scanAge >= 0 && scanAge < 900) {
      const p = scanAge / 900;
      state.scan.mesh.visible = true;
      state.scan.mesh.position.set(state.scan.x, 26 - 11 * p, 0);
      state.scan.mesh.material.opacity = 0.9 * Math.sin(p * Math.PI);
    } else {
      state.scan.mesh.visible = false;
    }
    // identity ghosts fade away: what went in = what came out
    for (let i = state.ghosts.length - 1; i >= 0; i--) {
      const g = state.ghosts[i];
      const age = now - g.t0;
      if (age > 2200) {
        scene.remove(g.mesh);
        g.mesh.material.dispose();
        state.ghosts.splice(i, 1);
      } else {
        g.mesh.material.opacity = 0.4 * (1 - age / 2200);
      }
    }
    // return wisps: None falls out of the exhaust and dissolves
    for (let i = state.wisps.length - 1; i >= 0; i--) {
      const w = state.wisps[i];
      const age = now - w.t0;
      if (age > 1600) {
        scene.remove(w.mesh);
        w.mesh.material.dispose();
        state.wisps.splice(i, 1);
      } else {
        const p = age / 1600;
        w.mesh.position.set(w.x, 15.5 - 7 * p, 0);
        w.mesh.material.opacity = 0.8 * (1 - p);
      }
    }
    // chambers: alive while called, grown on arrival, aperture flashing
    // while scanning
    for (const chamber of state.chambers.values()) {
      if (chamber.born !== undefined) {
        const age = now - chamber.born;
        const s = Math.min(1, age / 700);
        chamber.group.scale.setScalar(0.01 + 0.99 * (1 - Math.pow(1 - s, 3)));
        if (s >= 1) delete chamber.born;
      }
      chamber.body.material.opacity =
        (now < chamber.until) ? 0.7 : 0.35;
      chamber.aperture.material.emissive.setHex(
        (chamber.scanning && now < chamber.scanning) ? 0x2d8f5f : 0x1c2830);
    }
    if (state.cone.visible && state.cone.userData.until
        && now > state.cone.userData.until) {
      state.cone.visible = false;
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
