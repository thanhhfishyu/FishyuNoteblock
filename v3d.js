  // ================================================================ 3D view + in-game simulation
  const V = { ready: false, dirty: true, active: true, theta: -0.75, phi: 0.95, dist: 40, target: null, sim: null, raf: 0 };
  const PULSE = 10; // stone button: 1 s = 10 redstone ticks
  let threeP = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    if (threeP) return threeP;
    const tryLoad = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    threeP = tryLoad('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
      .catch(() => tryLoad('three.min.js'))
      .catch(() => { threeP = null; throw new Error('Không tải được thư viện 3D (cần mạng).'); });
    return threeP;
  }

  $('viewSeg').onclick = (e) => {
    const v = e.target.dataset.v; if (!v) return;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    $('pane3d').classList.toggle('hidden', v !== '3d');
    $('pane2d').classList.toggle('hidden', v !== '2d');
    V.active = v === '3d';
    if (V.active) show3d(); else simStop();
    if (!V.active) draw();
  };

  const BLOCK_COL = {
    'minecraft:smooth_stone': '#a9a9a9', 'minecraft:stone_bricks': '#7a7a7a', 'minecraft:dirt': '#86603e', 'minecraft:oak_planks': '#a8864f',
    'minecraft:stone': '#808080', 'minecraft:sand': '#dcd3a0', 'minecraft:glass': '#cfe9f3', 'minecraft:white_wool': '#eeeeee', 'minecraft:clay': '#a1a7b4',
    'minecraft:gold_block': '#f6d33c', 'minecraft:packed_ice': '#8db4f0', 'minecraft:bone_block': '#e3ddc5', 'minecraft:iron_block': '#dcdcdc',
    'minecraft:soul_sand': '#54412f', 'minecraft:pumpkin': '#d9801c', 'minecraft:emerald_block': '#41d070', 'minecraft:hay_block': '#c8a62b',
    'minecraft:glowstone': '#f3d088', 'minecraft:note_block': '#6e4a32',
  };

  function noiseTexture(seed, dark) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    let r = seed;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = Math.floor(205 + rnd() * 50 - (x === 0 || y === 0 || x === 15 || y === 15 ? dark : 0));
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1);
    }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }
  function noteTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#fff';
    [[9, 2, 2, 9], [11, 2, 3, 2], [13, 4, 1, 2], [5, 9, 5, 4], [4, 10, 1, 2], [10, 10, 1, 1]].forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }

  async function show3d() {
    if (!result) { if (V.root) { disposeGroup(V.root); V.root = null; } return; }
    try { $('v3msg').textContent = window.THREE ? '' : 'Đang tải 3D…'; await loadThree(); }
    catch (e) { $('v3msg').textContent = e.message; return; }
    $('v3msg').textContent = '';
    if (!V.ready) init3d();
    if (V.dirty) build3d();
    resize3d();
    if (!V.raf) V.raf = requestAnimationFrame(frame);
  }

  function init3d() {
    const cv = $('v3');
    V.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    V.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    V.scene = new THREE.Scene();
    V.scene.background = new THREE.Color('#9cc3ea');
    V.scene.fog = new THREE.Fog('#9cc3ea', 200, 600);
    V.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    V.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(0.6, 1, 0.35); V.scene.add(sun);
    V.texBlock = noiseTexture(7, 35); V.texNote = noiseTexture(13, 80); V.texParticle = noteTexture();
    V.target = new THREE.Vector3();
    V.ray = new THREE.Raycaster(); V.mouse = new THREE.Vector2();
    window.addEventListener('resize', resize3d);
    setupControls(cv);
    V.ready = true;
  }

  function resize3d() {
    if (!V.ready) return;
    const w = $('v3wrap').clientWidth, h = $('v3wrap').clientHeight;
    if (!w || !h) return;
    V.renderer.setSize(w, h, false);
    V.camera.aspect = w / h; V.camera.updateProjectionMatrix();
  }

  function disposeGroup(g) {
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    V.scene.remove(g);
  }

  function build3d() {
    simStop();
    if (V.root) disposeGroup(V.root);
    const root = new THREE.Group(); V.root = root; V.scene.add(root);
    const { lay, v } = result;
    const times = v.sim.times, hits = v.sim.hits;
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const solid = [], glass = [], notes = [], dust = [], reps = [], buttons = [], torches = [];
    lay.cells.forEach((b, k) => {
      const [x, y, z] = k.split(',').map(Number);
      const o = { x, y, z, b, k };
      if (b.name === 'minecraft:note_block') notes.push(o);
      else if (b.name === 'minecraft:redstone_wire') dust.push(o);
      else if (b.name === 'minecraft:repeater') reps.push(o);
      else if (b.name === 'minecraft:stone_button') buttons.push(o);
      else if (b.name === 'minecraft:redstone_torch') torches.push(o);
      else if (b.name === 'minecraft:glass') glass.push(o);
      else solid.push(o);
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; root.add(m); return m; };

    // full blocks
    const sm = inst(box, new THREE.MeshLambertMaterial({ map: V.texBlock }), solid.length);
    solid.forEach((o, i) => { m4.makeTranslation(o.x + 0.5, o.y + 0.5, o.z + 0.5); sm.setMatrixAt(i, m4); sm.setColorAt(i, col.set(BLOCK_COL[o.b.name] || '#999')); });
    const gm = inst(box, new THREE.MeshLambertMaterial({ map: V.texBlock, transparent: true, opacity: 0.45, depthWrite: false }), glass.length);
    glass.forEach((o, i) => { m4.makeTranslation(o.x + 0.5, o.y + 0.5, o.z + 0.5); gm.setMatrixAt(i, m4); gm.setColorAt(i, col.set(BLOCK_COL['minecraft:glass'])); });

    // note blocks
    const nm = inst(box, new THREE.MeshLambertMaterial({ map: V.texNote }), notes.length);
    const noteItems = notes.map((o, i) => {
      m4.makeTranslation(o.x + 0.5, o.y + 0.5, o.z + 0.5); nm.setMatrixAt(i, m4); nm.setColorAt(i, col.set(BLOCK_COL['minecraft:note_block']));
      const h = hits.get(o.k); return { o, i, hit: h && h.length ? Math.min(...h) : Infinity, inst: o.b.props.instrument, click: +o.b.props.note, state: 0 };
    });
    V.noteMesh = nm; V.noteItems = noteItems;

    // redstone dust: flat center + arms
    const dParts = [];
    dust.forEach((o) => {
      const t = times.has(o.k) ? times.get(o.k) : Infinity;
      dParts.push({ x: o.x + 0.5, z: o.z + 0.5, sx: 0.32, sz: 0.32, y: o.y + 0.03, t });
      const p = o.b.props;
      if (p.north === 'side') dParts.push({ x: o.x + 0.5, z: o.z + 0.22, sx: 0.2, sz: 0.44, y: o.y + 0.03, t });
      if (p.south === 'side') dParts.push({ x: o.x + 0.5, z: o.z + 0.78, sx: 0.2, sz: 0.44, y: o.y + 0.03, t });
      if (p.west === 'side') dParts.push({ x: o.x + 0.22, z: o.z + 0.5, sx: 0.44, sz: 0.2, y: o.y + 0.03, t });
      if (p.east === 'side') dParts.push({ x: o.x + 0.78, z: o.z + 0.5, sx: 0.44, sz: 0.2, y: o.y + 0.03, t });
    });
    const dm = inst(box, new THREE.MeshBasicMaterial(), dParts.length);
    dParts.forEach((d, i) => { m4.makeScale(d.sx, 0.04, d.sz).setPosition(d.x, d.y, d.z); dm.setMatrixAt(i, m4); dm.setColorAt(i, col.set('#4a0d08')); d.state = 0; });

    // repeaters: slab + 2 torches
    const rs = inst(box, new THREE.MeshLambertMaterial({ map: V.texBlock }), reps.length);
    const tParts = [];
    const DIRV = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
    reps.forEach((o, i) => {
      m4.makeScale(1, 0.125, 1).setPosition(o.x + 0.5, o.y + 0.0625, o.z + 0.5); rs.setMatrixAt(i, m4); rs.setColorAt(i, col.set('#b9b9b9'));
      const [fx, fz] = DIRV[o.b.props.facing]; // points to the input side
      const t = times.has(o.k) ? times.get(o.k) : Infinity;
      const d = +o.b.props.delay;
      const offs = [-0.3125, -0.0625 + 0.125 * (d - 1)];
      offs.forEach((s) => tParts.push({ x: o.x + 0.5 + fx * s, z: o.z + 0.5 + fz * s, y: o.y + 0.22, t }));
      // a small dark arrow line from input to output
      tParts.push({ x: o.x + 0.5 - fx * 0.0, z: o.z + 0.5, y: o.y + 0.13, t, flat: true, fx, fz });
    });
    torches.forEach((o) => {
      const t = times.has(o.k) ? times.get(o.k) : Infinity;
      tParts.push({ x: o.x + 0.5, z: o.z + 0.5, y: o.y + 0.31, t, stick: true, rest: o.b.props.lit === 'true' });
      tParts.push({ x: o.x + 0.5, z: o.z + 0.5, y: o.y + 0.66, t, head: true, rest: o.b.props.lit === 'true' });
    });
    const tm = inst(box, new THREE.MeshBasicMaterial(), tParts.length);
    tParts.forEach((p, i) => {
      if (p.flat) m4.makeScale(p.fx ? 0.7 : 0.08, 0.02, p.fz ? 0.7 : 0.08).setPosition(p.x, p.y, p.z);
      else if (p.stick) m4.makeScale(0.12, 0.62, 0.12).setPosition(p.x, p.y, p.z);
      else if (p.head) m4.makeScale(0.17, 0.17, 0.17).setPosition(p.x, p.y, p.z);
      else m4.makeScale(0.13, 0.26, 0.13).setPosition(p.x, p.y, p.z);
      tm.setMatrixAt(i, m4); p.state = -1;
    });

    // buttons
    const bm = inst(box, new THREE.MeshLambertMaterial({ map: V.texBlock }), buttons.length);
    buttons.forEach((o, i) => {
      if (o.b.props.face === 'floor') m4.makeScale(0.38, 0.12, 0.25).setPosition(o.x + 0.5, o.y + 0.06, o.z + 0.5);
      else m4.makeScale(0.12, 0.25, 0.38).setPosition(o.x + 0.94, o.y + 0.5, o.z + 0.5);
      bm.setMatrixAt(i, m4); bm.setColorAt(i, col.set('#8f8f8f'));
    });
    V.buttonMesh = bm; V.buttons = buttons;

    // ground grid
    const S = lay.size;
    const gw = Math.max(S.x, S.z) + 24;
    const grid = new THREE.GridHelper(gw, gw, 0x5d7a52, 0x6f8f63); grid.position.set(S.x / 2, -0.001, S.z / 2); root.add(grid);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gw), new THREE.MeshLambertMaterial({ color: '#7fa86b' }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(S.x / 2, -0.01, S.z / 2); root.add(ground);

    // particles pool
    V.particles = [];
    for (let i = 0; i < 160; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: V.texParticle, transparent: true, depthWrite: false }));
      sp.scale.set(0.45, 0.45, 1); sp.visible = false; root.add(sp); V.particles.push({ sp, t0: 0 });
    }
    V.pIdx = 0;

    V.dust = { mesh: dm, parts: dParts };
    V.torch = { mesh: tm, parts: tParts };
    V.end = Math.max(0, ...noteItems.map((n) => (n.hit === Infinity ? 0 : n.hit))) + PULSE + 5;
    V.dirty = false;
    resetCam();
    paintState(-1);
  }

  function resetCam() {
    const S = result.lay.size;
    V.target.set(S.x / 2, Math.min(S.y / 2, 6), S.z / 2);
    V.theta = -0.75; V.phi = 0.95;
    V.dist = Math.max(12, Math.max(S.x, S.z, S.y * 1.5) * 1.05);
  }
  $('camReset').onclick = () => { if (V.ready && result) resetCam(); };

  // paint powered state at time t (redstone ticks)
  const C_DUST_OFF = new THREE_COLOR('#4a0d08'), C_DUST_ON = new THREE_COLOR('#ff2b1a');
  function THREE_COLOR(h) { return { h, c: null, get() { if (!this.c) this.c = new THREE.Color(this.h); return this.c; } }; }
  const C_TORCH_OFF = new THREE_COLOR('#5c1a14'), C_TORCH_ON = new THREE_COLOR('#ff4c2e'), C_ARROW_OFF = new THREE_COLOR('#6a1a12'), C_ARROW_ON = new THREE_COLOR('#ff8a5c');
  const C_STICK = new THREE_COLOR('#7a5a3a'), C_HEAD_ON = new THREE_COLOR('#ff3b1f'), C_HEAD_OFF = new THREE_COLOR('#4a1410');
  const C_NOTE = new THREE_COLOR('#6e4a32'), C_NOTE_HIT = new THREE_COLOR('#ffe082');
  function paintState(t) {
    const on = (st) => t >= st && t < st + PULSE;
    let ch = false;
    for (let i = 0; i < V.dust.parts.length; i++) {
      const p = V.dust.parts[i]; const s = on(p.t) ? 1 : 0;
      if (s !== p.state) { p.state = s; V.dust.mesh.setColorAt(i, (s ? C_DUST_ON : C_DUST_OFF).get()); ch = true; }
    }
    if (ch) V.dust.mesh.instanceColor.needsUpdate = true;
    ch = false;
    for (let i = 0; i < V.torch.parts.length; i++) {
      const p = V.torch.parts[i];
      let s = on(p.t) ? 1 : 0;
      if (p.stick || p.head) s = (p.rest ? 1 : 0) ^ s;
      if (s !== p.state) {
        p.state = s;
        const c = p.flat ? (s ? C_ARROW_ON : C_ARROW_OFF) : p.stick ? C_STICK : p.head ? (s ? C_HEAD_ON : C_HEAD_OFF) : (s ? C_TORCH_ON : C_TORCH_OFF);
        V.torch.mesh.setColorAt(i, c.get()); ch = true;
      }
    }
    if (ch) V.torch.mesh.instanceColor.needsUpdate = true;
    ch = false;
    for (const n of V.noteItems) {
      const s = t >= n.hit && t < n.hit + 2 ? 1 : 0;
      if (s !== n.state) { n.state = s; V.noteMesh.setColorAt(n.i, (s ? C_NOTE_HIT : C_NOTE).get()); ch = true; }
    }
    if (ch) V.noteMesh.instanceColor.needsUpdate = true;
    if (V.buttonMesh && V.buttons.length) { V.buttonMesh.setColorAt(0, new THREE.Color(on(0) ? '#5fcf65' : '#8f8f8f')); V.buttonMesh.instanceColor.needsUpdate = true; }
  }

  function spawnParticle(n, now) {
    const p = V.particles[V.pIdx++ % V.particles.length];
    p.sp.position.set(n.o.x + 0.5, n.o.y + 1.25, n.o.z + 0.5);
    // Minecraft-like note colour: hue follows the pitch
    p.sp.material.color.setHSL(((24 - n.click) / 24) * 0.75 + 0.05, 0.9, 0.55);
    p.sp.material.opacity = 1; p.sp.visible = true; p.t0 = now;
  }

  // ---------------- simulation playback
  function simStart() {
    if (!result || !V.ready) return;
    stop(); // stop the 2D audio preview if running
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
    NOISE = NOISE || noiseBuf();
    const master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
    const comp = actx.createDynamicsCompressor(); comp.connect(master);
    const speed = +$('simSpeed').value;
    const order = V.noteItems.filter((n) => n.hit !== Infinity).sort((a, b) => a.hit - b.hit);
    V.sim = { start: actx.currentTime + 0.2, speed, master, comp, order, next: 0, nextP: 0, sound: $('simSound').checked };
    $('simPlay').textContent = '⏸ Dừng mô phỏng';
  }
  function simStop() {
    if (V.sim) { V.sim.master.disconnect(); V.sim = null; }
    $('simPlay').textContent = '▶ Mô phỏng trong game';
    $('simInfo').textContent = '';
    if (V.ready && V.dust) paintState(-1);
  }
  $('simPlay').onclick = () => { if (V.sim) simStop(); else simStart(); };
  $('simSpeed').onchange = () => { if (V.sim) { simStop(); simStart(); } };

  function frame() {
    V.raf = 0;
    if (!V.active || !V.ready) return;
    V.raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    if (V.sim && V.dust) {
      const S = V.sim;
      const at = actx.currentTime;
      const t = (at - S.start) * 10 * S.speed;
      // schedule sound slightly ahead
      while (S.next < S.order.length && S.start + S.order[S.next].hit / 10 / S.speed < at + 0.25) {
        const n = S.order[S.next++];
        if (S.sound) voice(n.inst, n.click, Math.max(at, S.start + n.hit / 10 / S.speed), S.comp);
      }
      let lastHit = null;
      while (S.nextP < S.order.length && S.order[S.nextP].hit <= t) { const n = S.order[S.nextP++]; spawnParticle(n, now); lastHit = n; }
      if (lastHit && $('simFollow').checked) V.followTo = new THREE.Vector3(lastHit.o.x + 0.5, lastHit.o.y + 0.5, lastHit.o.z + 0.5);
      paintState(t);
      const tt = Math.max(0, t) / 10;
      $('simInfo').textContent = `${tt.toFixed(1)} / ${(V.end / 10).toFixed(1)} giây`;
      if (t > V.end) simStop();
    }
    if (V.followTo && V.sim) V.target.lerp(V.followTo, 0.06);
    for (const p of V.particles) {
      if (!p.sp.visible) continue;
      const a = now - p.t0;
      if (a > 0.9) { p.sp.visible = false; continue; }
      p.sp.position.y += 0.012; p.sp.material.opacity = 1 - a / 0.9;
    }
    const sp = Math.sin(V.phi), cp = Math.cos(V.phi);
    V.camera.position.set(V.target.x + V.dist * sp * Math.cos(V.theta), V.target.y + V.dist * cp, V.target.z + V.dist * sp * Math.sin(V.theta));
    V.camera.lookAt(V.target);
    V.renderer.render(V.scene, V.camera);
  }

  // ---------------- controls (left: rotate, right/shift: pan, wheel/pinch: zoom)
  function setupControls(cv) {
    const ptrs = new Map();
    let mode = null, lastPinch = 0, lastMid = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    const pan = (dx, dy) => {
      const k = V.dist * 0.0018;
      const right = new THREE.Vector3(-Math.sin(V.theta), 0, Math.cos(V.theta));
      const fwd = new THREE.Vector3(-Math.cos(V.theta), 0, -Math.sin(V.theta));
      V.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
      V.followTo = null;
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      mode = ptrs.size >= 2 ? 'pinch' : (e.button === 2 || e.shiftKey ? 'pan' : 'rot');
      if (mode === 'pinch') { const [a, b] = [...ptrs.values()]; lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      tip.style.display = 'none';
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) { hover3d(e); return; }
      const p = ptrs.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (mode === 'rot') { V.theta += dx * 0.006; V.phi = Math.max(0.08, Math.min(1.52, V.phi - dy * 0.006)); }
      else if (mode === 'pan') pan(dx, dy);
      else if (mode === 'pinch' && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lastPinch) V.dist = Math.max(3, Math.min(1500, V.dist * lastPinch / d));
        if (lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
        lastPinch = d; lastMid = mid;
      }
    });
    const up = (e) => { ptrs.delete(e.pointerId); mode = ptrs.size === 1 ? 'rot' : null; lastPinch = 0; lastMid = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); V.dist = Math.max(3, Math.min(1500, V.dist * Math.pow(1.0015, e.deltaY))); }, { passive: false });
  }

  function hover3d(e) {
    if (!V.noteMesh || !V.noteItems.length) return;
    const r = $('v3').getBoundingClientRect();
    V.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    V.ray.setFromCamera(V.mouse, V.camera);
    const hit = V.ray.intersectObject(V.noteMesh)[0];
    if (!hit) { tip.style.display = 'none'; return; }
    const n = V.noteItems[hit.instanceId]; const I = INST[n.inst];
    tip.textContent = `Note block · ${I.vi}\nKhối dưới: ${I.block.replace('minecraft:', '')}\nBấm chuột phải ${n.click} lần${I.perc ? '' : ' (' + noteName(I.low + n.click) + ')'}\nVị trí x=${n.o.x} y=${n.o.y} z=${n.o.z}`;
    tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  }

  function update3d() { V.dirty = true; if (V.active) show3d(); }
