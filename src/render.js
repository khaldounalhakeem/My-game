'use strict';
// ============================================================================
// Rendering: arena meshes, map scenery, cars, ball, pads, camera
// ============================================================================

const R = {
  renderer: null, scene: null, camera: null, world: null,
  carViews: new Map(), ballView: null, padViews: [], tileViews: [], dynamic: [],
  cam: { pos: new V3(0, 600, -3000), look: new V3(), up: new V3(0, 1, 0), dir: new V3(0, 0, 1), shake: 0, ballCam: true, init: false },
  time: 0,
};

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function hex2css(h) { return '#' + h.toString(16).padStart(6, '0'); }

function initRenderer(canvas) {
  const q = qualityLevel();
  R.renderer = new THREE.WebGLRenderer({ canvas, antialias: q >= 2, powerPreference: 'high-performance' });
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q >= 2 ? 1.6 : q === 1 ? 1.2 : 0.85));
  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(70, 1, 8, 90000);
  resizeRenderer();
}
function qualityLevel() {
  const s = Settings.quality;
  if (s === 'low') return 0; if (s === 'medium') return 1; if (s === 'high') return 2;
  const mobile = /iPad|iPhone|Android|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  return mobile ? 1 : 2;
}
function resizeRenderer() {
  const w = window.innerWidth, h = window.innerHeight;
  R.renderer.setSize(w, h, false);
  R.camera.aspect = w / h;
  setFov();
}
function setFov() {
  const hf = THREE.MathUtils.degToRad(Settings.fov);
  const vf = 2 * Math.atan(Math.tan(hf / 2) / Math.max(1, R.camera.aspect));
  R.camera.fov = THREE.MathUtils.radToDeg(Math.min(vf, 1.6));
  R.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// World building
// ---------------------------------------------------------------------------
function buildWorld(game) {
  if (R.world) { R.scene.remove(R.world); disposeTree(R.world); }
  R.carViews.clear(); R.padViews = []; R.tileViews = []; R.dynamic = [];
  const world = new THREE.Group(); R.world = world; R.scene.add(world);
  const map = MAPS[game.mapKey];
  R.map = map;

  // sky + lights
  R.scene.background = new THREE.Color(map.sky[0]);
  R.scene.fog = new THREE.Fog(map.fog, 14000, 60000);
  world.add(buildSky(map));
  const hemi = new THREE.HemisphereLight(map.sky[1], 0x404030, map.amb * 0.55);
  world.add(hemi);
  const sun = new THREE.DirectionalLight(map.sun, map.sunI * 0.7);
  sun.position.set(-3000, 8000, -2000); world.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.12); fill.position.set(3000, 3000, 5000); world.add(fill);

  buildArena(world, game, map);
  buildScenery(world, map, game);
  // pads
  for (const p of game.pads) { const v = buildPad(p); world.add(v.group); R.padViews.push(v); }
  // ball
  R.ballView = buildBall(game.ball); world.add(R.ballView.group);
  // cars
  for (const c of game.cars) { const v = buildCar(c); world.add(v.group); R.carViews.set(c, v); }
  if (typeof FX !== 'undefined') FX.init(world, map);
}

function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) { const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
  });
}

function buildSky(map) {
  const geo = new THREE.SphereGeometry(80000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(map.sky[0]) }, bot: { value: new THREE.Color(map.sky[1]) }, night: { value: map.time === 'night' ? 1 : 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float t = clamp(vP.y*1.4+0.15,0.0,1.0); vec3 c = mix(bot, top, t);
        if(night>0.5 && vP.y>0.05){ vec3 q = floor(vP*400.0); float s = step(0.997, h(q)); c += vec3(s)*0.9*smoothstep(0.05,0.3,vP.y); }
        gl_FragColor = vec4(c,1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// outline of the rounded-rectangle arena: points with outward normals
function arenaOutline(A, breakXs) {
  const pts = [];
  const W = A.W, L = A.L, Rc = A.Rc;
  const straight = (x0, z0, x1, z1, nx, nz, back) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ts = [];
    const n = Math.max(2, Math.ceil(len / 380));
    for (let i = 0; i < n; i++) ts.push(i / n);
    if (back && breakXs) for (const bx of breakXs) { const t = (bx - x0) / (x1 - x0); if (t > 0.001 && t < 0.999) ts.push(t); }
    ts.sort((a, b) => a - b);
    for (const t of ts) pts.push({ x: lerp(x0, x1, t), z: lerp(z0, z1, t), nx, nz, back });
  };
  const arc = (cx, cz, a0) => {
    const n = 14;
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push({ x: cx + Rc * Math.cos(a), z: cz + Rc * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a), back: false }); }
  };
  straight(W, -(L - Rc), W, L - Rc, 1, 0, false);
  arc(W - Rc, L - Rc, 0);
  straight(W - Rc, L, -(W - Rc), L, 0, 1, true);
  arc(-(W - Rc), L - Rc, Math.PI / 2);
  straight(-W, L - Rc, -W, -(L - Rc), -1, 0, false);
  arc(-(W - Rc), -(L - Rc), Math.PI);
  straight(-(W - Rc), -L, W - Rc, -L, 0, -1, true);
  arc(W - Rc, -(L - Rc), Math.PI * 1.5);
  pts.push(pts[0]);
  return pts;
}

function buildArena(world, game, map) {
  const A = ARENA;
  const g = A.goal;
  // ---- floor ----
  const shape = new THREE.Shape();
  const ol = arenaOutline(A, null);
  ol.forEach((p, i) => (i ? shape.lineTo(p.x, p.z) : shape.moveTo(p.x, p.z)));
  const fgeo = new THREE.ShapeGeometry(shape, 24);
  fgeo.rotateX(Math.PI / 2);
  const uv = fgeo.attributes.uv, pos = fgeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (2 * A.W) + 0.5, pos.getZ(i) / (2 * A.L) + 0.5);
  fgeo.computeVertexNormals();
  const ftex = fieldTexture(map, game);
  const floor = new THREE.Mesh(fgeo, new THREE.MeshLambertMaterial({ map: ftex, side: THREE.DoubleSide }));
  // normals of rotated shape face down; flip via DoubleSide
  floor.position.y = A.dropshot ? -600 : 0;
  if (A.dropshot) floor.material = new THREE.MeshBasicMaterial({ color: 0x050308 });
  world.add(floor);

  // ---- walls (swept rounded profile) ----
  const breaks = g ? [-g.w, g.w] : null;
  const outline = arenaOutline(A, breaks);
  const rows = [];
  const nf = 7;
  for (let i = 0; i <= nf; i++) { const th = (i / nf) * Math.PI / 2; rows.push([A.Rf - A.Rf * Math.sin(th), A.Rf - A.Rf * Math.cos(th)]); }
  const wallYs = [];
  for (let y = A.Rf + 300; y < A.H - A.Rt - 100; y += 300) wallYs.push(y);
  if (g) wallYs.push(g.h);
  wallYs.sort((a, b) => a - b).forEach(y => rows.push([0, y]));
  for (let i = 0; i <= nf; i++) { const th = (i / nf) * Math.PI / 2; rows.push([A.Rt - A.Rt * Math.cos(th), A.H - A.Rt + A.Rt * Math.sin(th)]); }
  const P = [], C = [], U = [];
  const team0 = new THREE.Color(TEAM_COLORS[0].main), team1 = new THREE.Color(TEAM_COLORS[1].main), neutral = new THREE.Color(0xffffff);
  const col = new THREE.Color();
  const vtx = (p, row) => {
    const x = p.x - p.nx * row[0], z = p.z - p.nz * row[0];
    P.push(x, row[1], z);
    const t = clamp(z / A.L, -1, 1);
    col.copy(neutral).lerp(t < 0 ? team0 : team1, Math.min(1, Math.abs(t) * 1.1));
    const fade = row[1] < 40 ? 1.0 : 0.85;
    C.push(col.r * fade, col.g * fade, col.b * fade);
    U.push((Math.atan2(p.z, p.x) + Math.PI) * 12, row[1] / 180 + row[0] / 180);
  };
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    for (let j = 0; j < rows.length - 1; j++) {
      const r0 = rows[j], r1 = rows[j + 1];
      if (g && a.back && b.back && Math.abs(a.x) <= g.w + 1 && Math.abs(b.x) <= g.w + 1 && r1[1] <= g.h + 1) continue;
      vtx(a, r0); vtx(b, r0); vtx(b, r1);
      vtx(a, r0); vtx(b, r1); vtx(a, r1);
    }
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  wgeo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  wgeo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  wgeo.computeVertexNormals();
  const wtex = wallTexture(map);
  const walls = new THREE.Mesh(wgeo, new THREE.MeshLambertMaterial({ map: wtex, vertexColors: true, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
  walls.renderOrder = 2;
  world.add(walls);
  // solid lower ramp band (so the ramps read as solid surfaces)
  const P2 = [], C2 = [];
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    for (let j = 0; j < nf; j++) {
      const r0 = rows[j], r1 = rows[j + 1];
      if (g && a.back && b.back && Math.abs(a.x) <= g.w + 1 && Math.abs(b.x) <= g.w + 1) continue;
      for (const [p, r] of [[a, r0], [b, r0], [b, r1], [a, r0], [b, r1], [a, r1]]) {
        P2.push(p.x - p.nx * r[0], r[1] + 0.5, p.z - p.nz * r[0]);
        const t = clamp(p.z / A.L, -1, 1);
        col.set(map.grass[1]).lerp(t < 0 ? team0 : team1, Math.abs(t) * 0.25 + r[1] / A.Rf * 0.35);
        C2.push(col.r, col.g, col.b);
      }
    }
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
  rgeo.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3));
  rgeo.computeVertexNormals();
  world.add(new THREE.Mesh(rgeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // glowing trim lines at the top of the ramp and at the ceiling edge
  for (const y of [A.Rf, A.H - A.Rt, A.H - 2]) {
    const pts = outline.map(p => new V3(p.x - p.nx * (y > A.H - 10 ? A.Rt : 0), y, p.z - p.nz * (y > A.H - 10 ? A.Rt : 0)));
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    const cols = []; pts.forEach(p => { const c = new THREE.Color(p.z < 0 ? TEAM_COLORS[0].light : TEAM_COLORS[1].light); if (Math.abs(p.z) < 400) c.set(0xffffff); cols.push(c.r, c.g, c.b); });
    lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    world.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })));
  }
  // ceiling (faint)
  const cgeo = new THREE.ShapeGeometry(shape, 12); cgeo.rotateX(Math.PI / 2);
  const ceil = new THREE.Mesh(cgeo, new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  ceil.position.y = A.H; world.add(ceil);

  if (g) for (const s of [-1, 1]) world.add(buildGoal(s, map));
  if (A.hoop) for (const s of [-1, 1]) world.add(buildHoop(s));
  if (A.dropshot) buildTiles(world, map);
}

function fieldTexture(map, game) {
  const A = ARENA;
  return canvasTex(1024, Math.round(1024 * A.L / A.W), (g, w, h) => {
    const sx = w / (2 * A.W), sz = h / (2 * A.L);
    const X = (x) => (x + A.W) * sx, Z = (z) => h - (z + A.L) * sz;
    // grass stripes
    const n = 14;
    for (let i = 0; i < n; i++) { g.fillStyle = map.grass[i % 2]; g.fillRect(0, i * h / n, w, h / n + 1); }
    // grass noise
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // team tint
    let gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(47,123,255,0.16)'); gr.addColorStop(0.42, 'rgba(47,123,255,0)'); gr.addColorStop(0.58, 'rgba(255,122,26,0)'); gr.addColorStop(1, 'rgba(255,122,26,0.16)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = map.lines; g.lineWidth = 5; g.globalAlpha = 0.85;
    if (A.goal || A.dropshot) {
      g.beginPath(); g.moveTo(0, Z(0)); g.lineTo(w, Z(0)); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), 1000 * sx, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), 60 * sx, 0, Math.PI * 2); g.fillStyle = map.lines; g.fill();
    }
    if (A.goal) {
      for (const s of [-1, 1]) {
        const gl = s * A.L;
        g.strokeRect(X(-1800), Math.min(Z(gl), Z(gl - s * 1400)), 3600 * sx, 1400 * sz);
        g.strokeRect(X(-1100), Math.min(Z(gl), Z(gl - s * 600)), 2200 * sx, 600 * sz);
        g.beginPath(); g.arc(X(0), Z(gl - s * 1400), 500 * sx, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 0); g.stroke();
        g.fillStyle = s < 0 ? 'rgba(80,150,255,0.55)' : 'rgba(255,150,60,0.55)';
        g.fillRect(X(-A.goal.w), Math.min(Z(gl), Z(gl - s * 40)), 2 * A.goal.w * sx, 40 * sz);
      }
      // boost pad markings
      for (const p of game.pads) { g.beginPath(); g.arc(X(p.x), Z(p.z), (p.big ? 260 : 170) * sx, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.stroke(); }
    }
    if (A.hoop) {
      g.fillStyle = 'rgba(160,90,40,0.25)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = map.lines; g.lineWidth = 6;
      g.beginPath(); g.moveTo(0, Z(0)); g.lineTo(w, Z(0)); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), 700 * sx, 0, Math.PI * 2); g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(X(0), Z(s * A.hoop.z), 2000 * sx, 0, Math.PI * 2); g.stroke();
        g.fillStyle = s < 0 ? 'rgba(47,123,255,0.35)' : 'rgba(255,122,26,0.35)';
        g.fillRect(X(-900), Math.min(Z(s * A.L), Z(s * (A.L - 1700))), 1800 * sx, 1700 * sz);
      }
    }
    // centre logo
    g.globalAlpha = 0.25; g.fillStyle = '#fff'; g.font = `bold ${Math.round(w * 0.09)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(X(0), Z(0)); g.rotate(-Math.PI / 2); g.fillText('BOOST', 0, -w * 0.05); g.fillText('LEAGUE', 0, w * 0.05); g.restore();
    g.globalAlpha = 1;
  });
}

function wallTexture(map) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9aa6b4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
    // hex lattice
    const s = 32;
    for (let y = -1; y < 6; y++) for (let x = -1; x < 6; x++) {
      const cx = x * s * 1.5, cy = y * s * Math.sqrt(3) + (x % 2 ? s * Math.sqrt(3) / 2 : 0);
      g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + s * Math.cos(a), cy + s * Math.sin(a)); } g.stroke();
    }
  }, true);
}

function netTexture(color) {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = color; g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }, true);
}

function buildGoal(s, map) {
  const A = ARENA, g = A.goal;
  const team = s < 0 ? 0 : 1;
  const tc = TEAM_COLORS[team];
  const grp = new THREE.Group();
  const net = netTexture(hex2css(tc.light));
  net.repeat.set(8, 4);
  const netMat = new THREE.MeshBasicMaterial({ map: net, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const backMat = new THREE.MeshLambertMaterial({ color: tc.dark, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  const z0 = s * A.L, z1 = s * (A.L + g.d), zc = (z0 + z1) / 2;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * g.w, g.h), backMat); back.position.set(0, g.h / 2, z1); grp.add(back);
  const back2 = new THREE.Mesh(new THREE.PlaneGeometry(2 * g.w, g.h), netMat); back2.position.set(0, g.h / 2, z1 - s * 2); grp.add(back2);
  for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(g.d, g.h), netMat); side.rotation.y = Math.PI / 2; side.position.set(sx * g.w, g.h / 2, zc); grp.add(side); }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * g.w, g.d), netMat); roof.rotation.x = Math.PI / 2; roof.position.set(0, g.h, zc); grp.add(roof);
  const gfloor = new THREE.Mesh(new THREE.PlaneGeometry(2 * g.w, g.d), new THREE.MeshLambertMaterial({ color: new THREE.Color(map.grass[1]).multiplyScalar(0.7) }));
  gfloor.rotation.x = -Math.PI / 2; gfloor.position.set(0, 0.5, zc); grp.add(gfloor);
  // frame
  const frameMat = new THREE.MeshBasicMaterial({ color: tc.light });
  const post = new THREE.BoxGeometry(24, g.h, 24);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(post, frameMat); p.position.set(sx * (g.w + 6), g.h / 2, z0); grp.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * g.w + 36, 24, 24), frameMat); bar.position.set(0, g.h + 6, z0); grp.add(bar);
  // goal-line glow
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * g.w, 30), new THREE.MeshBasicMaterial({ color: tc.main, transparent: true, opacity: 0.8 }));
  line.rotation.x = -Math.PI / 2; line.position.set(0, 1.5, z0 + s * 15); grp.add(line);
  // back-wall panel around the goal (solid, team coloured)
  const panelShape = new THREE.Shape();
  const PW = A.W - A.Rc;
  panelShape.moveTo(-PW, 0); panelShape.lineTo(PW, 0); panelShape.lineTo(PW, A.H); panelShape.lineTo(-PW, A.H); panelShape.lineTo(-PW, 0);
  const hole = new THREE.Path(); hole.moveTo(-g.w, 0); hole.lineTo(-g.w, g.h); hole.lineTo(g.w, g.h); hole.lineTo(g.w, 0); hole.lineTo(-g.w, 0);
  panelShape.holes.push(hole);
  const panel = new THREE.Mesh(new THREE.ShapeGeometry(panelShape), new THREE.MeshBasicMaterial({ color: tc.dark, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  panel.position.z = z0 + s * 3; grp.add(panel);
  // big team banner above goal
  const ban = canvasTex(512, 128, (c, w, h) => { c.fillStyle = hex2css(tc.main); c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tc.name, w / 2, h / 2 + 4); });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1400, 350), new THREE.MeshBasicMaterial({ map: ban, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  banner.position.set(0, g.h + 450, z0 + s * 4); if (s > 0) banner.rotation.y = Math.PI; grp.add(banner);
  return grp;
}

function buildHoop(s) {
  const A = ARENA, h = A.hoop;
  const tc = TEAM_COLORS[s < 0 ? 0 : 1];
  const grp = new THREE.Group();
  grp.position.set(0, 0, s * h.z);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(h.r, h.tube, 12, 64), new THREE.MeshLambertMaterial({ color: tc.main, emissive: tc.main, emissiveIntensity: 0.35 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = h.y; grp.add(rim);
  const net = netTexture(hex2css(tc.light)); net.repeat.set(16, 2);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, h.y, 48, 1, true), new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  cyl.position.y = h.y / 2; grp.add(cyl);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(h.r, 48), new THREE.MeshBasicMaterial({ color: tc.dark }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 2; grp.add(inner);
  // backboard
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(1800, 900), new THREE.MeshBasicMaterial({ color: tc.main, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  bb.position.set(0, h.y + 520, s * (A.L - h.z - 4)); grp.add(bb);
  const sq = new THREE.Mesh(new THREE.RingGeometry(260, 290, 4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  sq.position.set(0, h.y + 420, s * (A.L - h.z - 6)); sq.rotation.z = Math.PI / 4; grp.add(sq);
  return grp;
}

function buildTiles(world, map) {
  const s = ARENA.dropshot.s;
  const geo = new THREE.CylinderGeometry(s * 0.965, s * 0.965, 10, 6);
  geo.rotateY(0); // flat-topped hex: cylinder vertices start at +z; rotate by 30° for flat top along x
  geo.rotateY(Math.PI / 6);
  const neutral = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  // decorative/neutral tiles everywhere
  for (let q = -12; q <= 12; q++) for (let r = -16; r <= 16; r++) {
    const [x, z] = hexCenter(q, r);
    if (wallDist2D(x, z) < -s) continue;
    const t = Tiles.map.get(hexKey(q, r));
    if (t) {
      const mat = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[t.team].dark, emissive: TEAM_COLORS[t.team].main, emissiveIntensity: 0.15 });
      const m = new THREE.Mesh(geo, mat); m.position.set(x, -5, z); world.add(m);
      R.tileViews.push({ t, m, mat });
    } else { const m = new THREE.Mesh(geo, neutral); m.position.set(x, -5, z); world.add(m); }
  }
  // glowing edges between tiles
  const edges = new THREE.EdgesGeometry(geo);
  const em = new THREE.LineBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.35 });
  for (const tv of R.tileViews) { const l = new THREE.LineSegments(edges, em); l.position.copy(tv.m.position); l.position.y += 1; world.add(l); tv.edge = l; }
}

function updateTiles(dt) {
  for (const tv of R.tileViews) {
    const t = tv.t;
    tv.m.visible = t.state < 2; tv.edge.visible = t.state < 2;
    t.flash = Math.max(0, t.flash - dt * 2);
    const tc = TEAM_COLORS[t.team];
    tv.mat.emissive.set(t.state === 1 ? 0xffffff : tc.main);
    tv.mat.emissiveIntensity = (t.state === 1 ? 0.35 + 0.15 * Math.sin(R.time * 6) : 0.15) + t.flash;
  }
}

// ---------------------------------------------------------------------------
// Scenery per map
// ---------------------------------------------------------------------------
function buildScenery(world, map, game) {
  const A = ARENA;
  const grp = new THREE.Group(); world.add(grp);
  const groundCol = { stadium: 0x3c6e3a, park: 0x4d7a35, snow: 0xe8eef4, city: 0x1a1a24, beach: 0xe8d39a, temple: 0x4a6a3a, aqua: 0x0b3a4a }[map.scenery] || 0x3c6e3a;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), new THREE.MeshLambertMaterial({ color: groundCol }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -40; grp.add(ground);

  // stadium bowl with crowd (all maps)
  const crowdTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = map.time === 'night' ? '#151520' : '#3a3f4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const team = x < w / 2 ? Math.random() < 0.7 : Math.random() < 0.3;
      g.fillStyle = Math.random() < 0.55 ? (team ? '#3d86ff' : '#ff8a2b') : pick(['#ddd', '#888', '#c33', '#3c3', '#ee3', '#fff']);
      g.fillRect(x, y, 4, 6);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 3);
  }, true);
  crowdTex.repeat.set(10, 3);
  const bowlR = Math.max(A.W, A.L) + 2600;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(bowlR + 2400, bowlR, 3200, 64, 1, true), new THREE.MeshLambertMaterial({ map: crowdTex, side: THREE.BackSide }));
  stand.scale.set(A.W / A.L * 1.0 + 0.2, 1, 1);
  stand.position.y = 1100; grp.add(stand);
  // roof ring with lights
  const ring = new THREE.Mesh(new THREE.TorusGeometry(bowlR + 2700, 160, 8, 64), new THREE.MeshLambertMaterial({ color: 0x9aa3ad }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 2900; ring.scale.copy(stand.scale); grp.add(ring);
  const lightMat = new THREE.MeshBasicMaterial({ color: map.time === 'night' ? 0xcfe8ff : 0xfff6dd });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const tower = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(70, 110, 5200, 8), new THREE.MeshLambertMaterial({ color: 0x777f88 }));
    pole.position.y = 2600; tower.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(900, 500, 80), lightMat); panel.position.y = 5300; tower.add(panel);
    tower.position.set(Math.cos(a) * (bowlR + 1500) * stand.scale.x, 0, Math.sin(a) * (bowlR + 1500));
    tower.lookAt(0, 0, 0); grp.add(tower);
  }
  // jumbotron-like signs along stands
  const adTex = canvasTex(1024, 128, (g, w, h) => {
    const msgs = ['BOOST LEAGUE', 'SUPERSONIC', 'WHAT A SAVE!', 'CALCULATED', 'NICE SHOT!', 'BOOST LEAGUE'];
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#101a3a' : '#3a1a08'; g.fillRect(i * w / 6, 0, w / 6, h); g.fillStyle = i % 2 ? '#7fb3ff' : '#ffb070'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillText(msgs[i], i * w / 6 + w / 12, h / 2 + 10); }
  }, true);
  adTex.repeat.set(4, 1);
  const ads = new THREE.Mesh(new THREE.CylinderGeometry(bowlR - 60, bowlR - 60, 280, 64, 1, true), new THREE.MeshBasicMaterial({ map: adTex, side: THREE.BackSide }));
  ads.scale.copy(stand.scale); ads.position.y = 100; grp.add(ads);
  R.dynamic.push({ obj: adTex, update: (dt) => { adTex.offset.x += dt * 0.01; } });

  const rng = (a, b) => rand(a, b);
  const far = bowlR + 9000;
  const ringPos = (minR, maxR) => { const a = Math.random() * Math.PI * 2, r = rng(minR, maxR); return [Math.cos(a) * r, Math.sin(a) * r]; };

  if (map.scenery === 'park' || map.scenery === 'stadium' || map.scenery === 'temple') {
    const trunk = new THREE.CylinderGeometry(60, 90, 700, 6), crown = new THREE.ConeGeometry(500, 1500, 7);
    const tm = new THREE.MeshLambertMaterial({ color: 0x5a3a20 }), cm = new THREE.MeshLambertMaterial({ color: map.scenery === 'temple' ? 0x3b6b3b : map.time === 'storm' ? 0x264d2a : 0x2f6e2f });
    for (let i = 0; i < 90; i++) {
      const [x, z] = ringPos(far - 3000, far + 9000);
      const t = new THREE.Mesh(trunk, tm); t.position.set(x, 300, z); grp.add(t);
      const c = new THREE.Mesh(crown, cm); c.position.set(x, 1300, z); const s = rng(0.8, 1.6); c.scale.set(s, s, s); grp.add(c);
    }
    // hills
    const hm = new THREE.MeshLambertMaterial({ color: new THREE.Color(groundCol).multiplyScalar(0.85) });
    for (let i = 0; i < 14; i++) { const [x, z] = ringPos(far + 12000, far + 30000); const h = new THREE.Mesh(new THREE.SphereGeometry(rng(6000, 12000), 12, 8), hm); h.position.set(x, -2000, z); h.scale.y = 0.45; grp.add(h); }
  }
  if (map.scenery === 'temple') {
    const stone = new THREE.MeshLambertMaterial({ color: 0x8a7a6a });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3, r = far + 4000;
      const t = new THREE.Group();
      for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5000 - k * 900, 900, 5000 - k * 900), stone); b.position.y = k * 900 + 450; t.add(b); }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1600, 1400, 4), new THREE.MeshLambertMaterial({ color: 0x2f7a5a })); roof.position.y = 5200; roof.rotation.y = Math.PI / 4; t.add(roof);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); grp.add(t);
    }
  }
  if (map.scenery === 'snow') {
    const mm = new THREE.MeshLambertMaterial({ color: 0xf4f8ff }), rm = new THREE.MeshLambertMaterial({ color: 0x8c99a8 });
    for (let i = 0; i < 18; i++) {
      const [x, z] = ringPos(far + 6000, far + 30000);
      const h = rng(9000, 20000);
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.7, h, 6), rm); m.position.set(x, h / 2 - 500, z); grp.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.43, 6), mm); cap.position.set(x, h - h * 0.215 - 500, z); grp.add(cap);
    }
    const pm = new THREE.MeshLambertMaterial({ color: 0x2c5a3f });
    for (let i = 0; i < 70; i++) { const [x, z] = ringPos(far - 2000, far + 7000); const p = new THREE.Mesh(new THREE.ConeGeometry(380, 1600, 6), pm); p.position.set(x, 800, z); grp.add(p); }
  }
  if (map.scenery === 'city' || map.scenery === 'stadium') {
    const night = map.time === 'night';
    const winTex = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = night ? '#0b0c18' : '#6b7a8c'; g.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) { g.fillStyle = Math.random() < (night ? 0.45 : 0.2) ? (night ? pick(['#ffd27a', '#7fe7ff', '#ff6fe0']) : '#c9dcf0') : (night ? '#141626' : '#55657a'); g.fillRect(x, y, 5, 5); }
    }, true);
    const bm = new THREE.MeshBasicMaterial({ map: winTex, fog: true });
    const n = map.scenery === 'city' ? 90 : 30;
    for (let i = 0; i < n; i++) {
      const [x, z] = ringPos(far + 2000, far + 22000);
      const h = rng(3000, map.scenery === 'city' ? 22000 : 9000), w = rng(1500, 4000);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bm); b.position.set(x, h / 2, z); grp.add(b);
      if (night && Math.random() < 0.3) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 120, w * 1.02), new THREE.MeshBasicMaterial({ color: pick([0xff3fd0, 0x3ff2ff, 0x9a5cff]) })); s.position.set(x, h * rng(0.4, 0.95), z); grp.add(s); }
    }
  }
  if (map.scenery === 'beach') {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(200000, 80000), new THREE.MeshLambertMaterial({ color: 0x1f8fd0, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -30, 60000); grp.add(water);
    R.dynamic.push({ update: (dt) => { water.position.y = -30 + Math.sin(R.time * 0.6) * 15; } });
    const trunkM = new THREE.MeshLambertMaterial({ color: 0x8a6a40 }), leafM = new THREE.MeshLambertMaterial({ color: 0x2f9a3a });
    for (let i = 0; i < 50; i++) {
      const [x, z] = ringPos(far - 2000, far + 6000);
      const p = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(50, 80, 2000, 6), trunkM); t.position.y = 1000; t.rotation.z = 0.15; p.add(t);
      for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(160, 1200, 4), leafM); l.position.set(Math.cos(k) * 400, 2000, Math.sin(k) * 400); l.rotation.set(Math.sin(k) * 1.3, 0, Math.cos(k) * 1.3 + Math.PI / 2 * 0.0 + 1.6); p.add(l); }
      p.position.set(x, 0, z); grp.add(p);
    }
  }
  if (map.scenery === 'aqua') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(bowlR + 5000, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }));
    dome.scale.copy(stand.scale); grp.add(dome);
    const coral = [0xff6f91, 0xffc75f, 0x845ec2, 0x00c9a7];
    for (let i = 0; i < 60; i++) {
      const [x, z] = ringPos(far, far + 12000);
      const c = new THREE.Mesh(new THREE.DodecahedronGeometry(rng(400, 1400), 0), new THREE.MeshLambertMaterial({ color: pick(coral) }));
      c.position.set(x, 0, z); c.scale.y = rng(1, 3); grp.add(c);
    }
    // swimming "fish" (sprites)
    const fish = new THREE.Group(); grp.add(fish);
    for (let i = 0; i < 30; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(120, 420, 5), new THREE.MeshLambertMaterial({ color: pick(coral) })); f.rotation.z = Math.PI / 2; f.userData = { r: rng(far - 3000, far + 5000), a: rng(0, 6.28), y: rng(2000, 7000), s: rng(0.03, 0.08) }; fish.add(f); }
    R.dynamic.push({ update: (dt) => { fish.children.forEach(f => { const u = f.userData; u.a += u.s * dt; f.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); f.rotation.y = -u.a; }); } });
  }
  // blimp
  if (map.time !== 'storm' && map.scenery !== 'aqua') {
    const blimp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 12), new THREE.MeshLambertMaterial({ color: 0xdfe4ea })); body.scale.set(2.6, 1, 1); blimp.add(body);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(905, 905, 300, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x2f7bff })); stripe.rotation.z = Math.PI / 2; blimp.add(stripe);
    grp.add(blimp);
    R.dynamic.push({ update: (dt) => { const a = R.time * 0.03; blimp.position.set(Math.cos(a) * (far + 3000), 9000, Math.sin(a) * (far + 3000)); blimp.rotation.y = -a - Math.PI / 2; } });
  }
}

// ---------------------------------------------------------------------------
// Ball
// ---------------------------------------------------------------------------
function ballTexture(kind) {
  return canvasTex(512, 256, (g, w, h) => {
    if (kind === 'basketball') {
      g.fillStyle = '#e0702a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a1408'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      for (const x of [0, w / 4, w / 2, 3 * w / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      return;
    }
    if (kind === 'beach') {
      const cols = ['#ff4040', '#ffffff', '#3d86ff', '#ffd23f', '#ffffff', '#38c172'];
      for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.fillRect(i * w / 6, 0, w / 6 + 1, h); }
      return;
    }
    g.fillStyle = kind === 'dropshot' ? '#3a4050' : '#c9ccd2'; g.fillRect(0, 0, w, h);
    // panels
    g.fillStyle = kind === 'dropshot' ? '#1c2030' : '#5d636e';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
      const cx = (x + (y % 2) * 0.5) * w / 8, cy = (y + 0.5) * h / 4;
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + 20 * Math.cos(a), cy + 20 * Math.sin(a)); } g.fill();
    }
    g.strokeStyle = kind === 'dropshot' ? '#7fe8ff' : '#f5f7fa'; g.lineWidth = 3;
    for (let y = 0; y <= h; y += h / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += w / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  });
}
function buildBall(ball) {
  const grp = new THREE.Group();
  let mesh;
  const tex = ballTexture(ball.kind);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.15, emissive: 0x000000 });
  if (ball.kind === 'cube') mesh = new THREE.Mesh(new THREE.BoxGeometry(ball.radius * 1.6, ball.radius * 1.6, ball.radius * 1.6), mat);
  else if (ball.puck) mesh = new THREE.Mesh(new THREE.CylinderGeometry(ball.radius, ball.radius, ball.h * 2, 40), new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.3, metalness: 0.4 }));
  else mesh = new THREE.Mesh(new THREE.SphereGeometry(ball.radius, 40, 28), mat);
  grp.add(mesh);
  // glow ring for visibility
  const glow = new THREE.Mesh(new THREE.SphereGeometry(ball.radius * 1.08, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }));
  if (!ball.puck) grp.add(glow);
  // shadow blob
  const sh = new THREE.Mesh(new THREE.CircleGeometry(ball.radius * 1.05, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1;
  R.world && R.world.add(sh);
  return { group: grp, mesh, glow, shadow: sh, mat };
}

// ---------------------------------------------------------------------------
// Boost pads
// ---------------------------------------------------------------------------
function buildPad(p) {
  const grp = new THREE.Group(); grp.position.set(p.x, 0, p.z);
  const r = p.big ? 160 : 95;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 10, 24), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  base.position.y = 5; grp.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, p.big ? 10 : 7, 6, 24), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 11; grp.add(ring);
  let orb;
  if (p.big) {
    orb = new THREE.Mesh(new THREE.SphereGeometry(52, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.95 }));
    orb.position.y = 85; grp.add(orb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(80, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff9a20, transparent: true, opacity: 0.25, depthWrite: false }));
    orb.add(halo);
  } else {
    orb = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffd040 }));
    orb.position.y = 13; grp.add(orb);
  }
  return { group: grp, orb, ring, ringMat, p };
}

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
const CAR_SHAPES = {
  striker: { lower: [[-52, -2], [-54, 20], [-30, 27], [30, 27], [62, 20], [76, 10], [74, -2]], cabin: [[-30, 27], [-16, 44], [12, 44], [32, 27]], w: 80, cw: 62, spoiler: true },
  phantom: { lower: [[-60, -2], [-62, 18], [-40, 22], [40, 22], [70, 16], [82, 8], [80, -2]], cabin: [[-38, 22], [-18, 34], [16, 34], [42, 22]], w: 80, cw: 60, spoiler: true },
  blade: { lower: [[-60, -2], [-62, 16], [-30, 22], [20, 22], [85, 6], [86, -1]], cabin: [[-36, 22], [-22, 33], [6, 33], [30, 20]], w: 76, cw: 52, spoiler: false, fins: true },
  wedge: { lower: [[-62, -2], [-64, 14], [-10, 20], [60, 14], [82, 6], [82, -2]], cabin: [[-30, 19], [-18, 28], [10, 28], [30, 17]], w: 84, cw: 50, spoiler: true },
  hybrid: { lower: [[-58, -2], [-60, 20], [-34, 25], [30, 25], [70, 16], [80, 6], [78, -2]], cabin: [[-34, 25], [-20, 40], [10, 40], [32, 25]], w: 80, cw: 60, spoiler: true },
  tank: { lower: [[-56, -2], [-56, 30], [-40, 34], [44, 34], [66, 26], [70, 12], [68, -2]], cabin: [[-38, 34], [-26, 52], [18, 52], [38, 34]], w: 76, cw: 64, spoiler: false },
};

function extrudePoly(pts, width) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -width / 2);
  // planar UVs: sides use (x,y), top/front/back use (x,z)
  geo.computeVertexNormals();
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < pos.count; i++) { minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i)); minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - minX) / (maxX - minX);
    if (Math.abs(nrm.getZ(i)) > 0.6) uv.setXY(i, u, (pos.getY(i) - minY) / (maxY - minY));
    else uv.setXY(i, u, pos.getZ(i) / (width + 6) + 0.5);
  }
  return geo;
}

function decalTexture(decal, base, accent) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex2css(base); g.fillRect(0, 0, w, h);
    const ac = hex2css(accent);
    g.fillStyle = ac; g.strokeStyle = ac;
    switch (decal) {
      case 'stripes': g.fillRect(0, h * 0.40, w, h * 0.07); g.fillRect(0, h * 0.53, w, h * 0.07); break;
      case 'flames':
        for (let i = 0; i < 9; i++) { g.beginPath(); const y = h * (0.15 + i * 0.09); g.moveTo(w, y - 10); g.quadraticCurveTo(w * 0.7, y - 20, w * (0.25 + Math.random() * 0.2), y); g.quadraticCurveTo(w * 0.7, y + 18, w, y + 10); g.fill(); }
        g.fillStyle = 'rgba(255,220,60,0.8)'; for (let i = 0; i < 9; i++) { g.beginPath(); const y = h * (0.15 + i * 0.09); g.moveTo(w, y - 4); g.quadraticCurveTo(w * 0.8, y - 8, w * 0.55, y); g.quadraticCurveTo(w * 0.8, y + 8, w, y + 4); g.fill(); }
        break;
      case 'tiger': for (let i = 0; i < 14; i++) { g.beginPath(); const x = i * w / 14; g.moveTo(x, 0); g.lineTo(x + 14, h * 0.35); g.lineTo(x + 4, h * 0.5); g.lineTo(x + 16, h * 0.65); g.lineTo(x, h); g.lineTo(x + 8, h * 0.5); g.fill(); } break;
      case 'checker': for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 && x > 4) g.fillRect(x * w / 8, y * h / 8, w / 8, h / 8); break;
      case 'lightning': g.lineWidth = 8; for (let k = 0; k < 3; k++) { g.beginPath(); let y = h * (0.3 + k * 0.2); g.moveTo(0, y); for (let x = 0; x < w; x += 24) { y += (Math.random() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } break;
      case 'dots': for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 10, 0, Math.PI * 2); g.fill(); } break;
      case 'camo': for (let i = 0; i < 60; i++) { g.fillStyle = pick([ac, '#2f3a24', '#58613d', hex2css(base)]); g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 25, 6 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2); g.fill(); } break;
    }
    // panel line + shading
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, h * 0.94, w, h * 0.06);
  });
}

function buildCar(car) {
  const lo = car.loadout || {};
  const shape = CAR_SHAPES[car.bodyKey] || CAR_SHAPES.striker;
  const tc = TEAM_COLORS[car.team];
  const paint = PAINTS[lo.paint || 0];
  const accent = paint && paint.hex !== null ? paint.hex : (lo.accent || 0xeeeeee);
  const grp = new THREE.Group();
  const model = new THREE.Group(); grp.add(model);
  const base = tc.main;
  const bodyMat = new THREE.MeshStandardMaterial({ map: decalTexture(lo.decal || 'none', base, accent), roughness: 0.35, metalness: 0.35 });
  const lower = new THREE.Mesh(extrudePoly(shape.lower, shape.w - 6), bodyMat); model.add(lower);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: 0.1, metalness: 0.8 });
  const cabin = new THREE.Mesh(extrudePoly(shape.cabin, shape.cw - 6), glassMat); model.add(cabin);
  // roof plate
  const c = shape.cabin;
  const roofY = c[1][1], roofX0 = c[1][0], roofX1 = c[2][0];
  const roofMat = new THREE.MeshStandardMaterial({ color: tc.dark, roughness: 0.4, metalness: 0.3 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofX1 - roofX0 + 4, 4, shape.cw - 2), roofMat);
  roof.position.set((roofX0 + roofX1) / 2, roofY + 2, 0); model.add(roof);
  if (shape.spoiler) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(14, 3, shape.w), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }));
    const rear = shape.lower[1];
    sp.position.set(rear[0] + 6, rear[1] + 12, 0); model.add(sp);
    for (const z of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 3), roofMat); st.position.set(rear[0] + 8, rear[1] + 5, z * shape.w * 0.3); model.add(st); }
  }
  if (shape.fins) for (const z of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 3), new THREE.MeshStandardMaterial({ color: accent })); f.position.set(-50, 22, z * 30); f.rotation.z = 0.4; model.add(f); }
  // lights
  const front = shape.lower[shape.lower.length - 2];
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
  for (const z of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 12), hl); l.position.set(front[0] + 1, front[1] - 1, z * shape.w * 0.32); model.add(l); }
  const tlm = new THREE.MeshBasicMaterial({ color: 0xff2030 });
  const rear0 = shape.lower[0];
  for (const z of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 14), tlm); l.position.set(rear0[0] - 3, 12, z * shape.w * 0.3); model.add(l); }
  // exhaust
  const exMat = new THREE.MeshStandardMaterial({ color: 0x444a52, metalness: 0.9, roughness: 0.3 });
  const exhaust = new V3(rear0[0] - 4, 9, 0);
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 10, 10), exMat); ex.rotation.z = Math.PI / 2; ex.position.copy(exhaust); model.add(ex);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 40, 10), flameMat); flame.rotation.z = Math.PI / 2; flame.position.set(exhaust.x - 22, exhaust.y, 0); flame.visible = false; model.add(flame);

  // wheels
  const b = car.body;
  const wheels = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 });
  const rimCol = { classic: 0xc0c6cf, spinner: 0xe8e8e8, neon: 0x30f0ff, gold: 0xffc83a, offroad: 0x333333, star: 0xff4fd8 }[lo.wheels || 'classic'];
  const rimMat = new THREE.MeshStandardMaterial({ color: rimCol, metalness: 0.8, roughness: 0.25, emissive: lo.wheels === 'neon' ? 0x30f0ff : 0x000000, emissiveIntensity: 0.6 });
  for (const [x, r] of [[b.wf, b.rf], [b.wb, b.rb]]) for (const z of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x, r - PHYS.REST_HEIGHT, z * (shape.w / 2 - 2));
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, lo.wheels === 'offroad' ? 16 : 12, 18), tireMat); tire.rotation.x = Math.PI / 2; spin.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 13, lo.wheels === 'star' ? 5 : 10), rimMat); rim.rotation.x = Math.PI / 2; spin.add(rim);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.2, 13.5), tireMat); spin.add(spoke);
    model.add(pivot);
    wheels.push({ pivot, spin, front: x > 0 });
  }
  // topper / antenna
  addTopper(model, lo.topper, roofX0, roofX1, roofY + 4, accent, car.team);
  addAntenna(model, lo.antenna, rear0[0] + 10, shape.lower[1][1] + 2, -shape.w * 0.32, car.team);

  // under-glow shadow blob
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(b.l * 1.3, b.w * 1.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, map: blobTex() }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1;
  R.world.add(shadow);

  // nameplate
  const plate = makeNameplate(car);
  grp.add(plate);
  return { group: grp, model, wheels, flame, flameMat, exhaust, shadow, plate, bodyMat };
}

let _blobTex = null;
function blobTex() {
  if (_blobTex) return _blobTex;
  _blobTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return _blobTex;
}

function addTopper(model, t, x0, x1, y, accent, team) {
  if (!t || t === 'none') return;
  const g = new THREE.Group(); g.position.set((x0 + x1) / 2, y, 0); model.add(g);
  const M = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: e || 0, emissiveIntensity: 0.6 });
  if (t === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(accent)); g.add(c); const v = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 20), M(accent)); v.position.set(14, 0, 0); g.add(v); }
  if (t === 'crown') { const c = new THREE.Mesh(new THREE.CylinderGeometry(14, 12, 12, 8, 1, true), M(0xffc83a, 0x553300)); c.material.side = THREE.DoubleSide; c.position.y = 6; g.add(c); for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 4), M(0xffc83a)); s.position.set(Math.cos(i * 0.785) * 13, 15, Math.sin(i * 0.785) * 13); g.add(s); } }
  if (t === 'halo') { const h = new THREE.Mesh(new THREE.TorusGeometry(14, 2.5, 6, 20), M(0xfff2a0, 0xfff2a0)); h.rotation.x = Math.PI / 2; h.position.y = 20; g.add(h); }
  if (t === 'propeller') { const c = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(TEAM_COLORS[team].light)); g.add(c); const p = new THREE.Mesh(new THREE.BoxGeometry(36, 1.5, 5), M(0xff3030)); p.position.y = 14; p.userData.spin = true; g.add(p); g.userData.prop = p; }
  if (t === 'cone') { const c = new THREE.Mesh(new THREE.ConeGeometry(10, 28, 12), M(0xff7a1a)); c.position.y = 14; g.add(c); const s = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.6, 5, 12), M(0xffffff)); s.position.y = 14; g.add(s); }
  if (t === 'horns') for (const z of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(4, 18, 8), M(0xcc1111)); h.position.set(0, 8, z * 12); h.rotation.x = z * 0.4; g.add(h); }
  model.userData.topper = g;
}
function addAntenna(model, t, x, y, z, team) {
  if (!t || t === 'none') return;
  const g = new THREE.Group(); g.position.set(x, y, z); model.add(g);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 50, 4), new THREE.MeshBasicMaterial({ color: 0x222222 })); stick.position.y = 25; g.add(stick);
  const top = new THREE.Group(); top.position.y = 52; g.add(top);
  const tc = TEAM_COLORS[team];
  if (t === 'flag') { const f = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), new THREE.MeshBasicMaterial({ color: tc.main, side: THREE.DoubleSide })); f.position.set(-11, -6, 0); top.add(f); }
  if (t === 'ball') top.add(new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd })));
  if (t === 'star') top.add(new THREE.Mesh(new THREE.OctahedronGeometry(8), new THREE.MeshBasicMaterial({ color: 0xffd23a })));
  if (t === 'heart') top.add(new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b7a })));
  if (t === 'bolt') top.add(new THREE.Mesh(new THREE.ConeGeometry(5, 16, 4), new THREE.MeshBasicMaterial({ color: 0xffe23a })));
  model.userData.antenna = g;
}

function makeNameplate(car) {
  const tc = TEAM_COLORS[car.team];
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(car.name, w / 2, h / 2);
    g.fillStyle = car.team === 0 ? '#9cc4ff' : '#ffc08a'; g.fillText(car.name, w / 2, h / 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.16, 0.04, 1); sp.position.set(0, 110, 0); sp.renderOrder = 50;
  void tc;
  return sp;
}

// ---------------------------------------------------------------------------
// Per-frame sync
// ---------------------------------------------------------------------------
function syncCarView(car, v, state) {
  // state: optional replay frame data [x,y,z,qx,qy,qz,qw,boost,demo,ss,wheel,steer]
  let px, py, pz, boosting, demo, wheelSpin, steer;
  if (state) {
    px = state[0]; py = state[1]; pz = state[2];
    v.group.quaternion.set(state[3], state[4], state[5], state[6]);
    boosting = state[7]; demo = state[8]; wheelSpin = state[10]; steer = state[11];
  } else {
    px = car.pos.x; py = car.pos.y; pz = car.pos.z; v.group.quaternion.copy(car.quat);
    boosting = car.boosting; demo = car.demolished; wheelSpin = car.wheelSpin; steer = car.steerVis;
  }
  v.group.position.set(px, py, pz);
  v.group.visible = !demo;
  v.shadow.visible = !demo;
  for (const w of v.wheels) {
    w.spin.rotation.z = -wheelSpin;
    if (w.front) w.pivot.rotation.y = -steer * 0.45;
  }
  v.flame.visible = !!boosting;
  if (boosting) { v.flame.scale.set(1, 0.8 + Math.random() * 0.6, 1); }
  const tp = v.model.userData.topper; if (tp && tp.userData.prop) tp.userData.prop.rotation.y += 0.4;
  const an = v.model.userData.antenna; if (an) an.rotation.z = Math.sin(R.time * 8 + car.id) * 0.08 + (car.vel ? clamp(car.vel.length() / 2300, 0, 1) * 0.3 : 0);
  // blob shadow on the floor
  const d = arenaDist(px, py, pz, false);
  if (py < 900 && d < 600) {
    v.shadow.position.set(px, 1.2, pz);
    const s = clamp(1 - py / 900, 0.2, 1);
    v.shadow.material.opacity = 0.45 * s;
    v.shadow.visible = !demo && py < 900;
  } else v.shadow.visible = false;
  v.plate.visible = Settings.nameplates && !demo && car !== (typeof Game !== 'undefined' && CUR && CUR.game ? CUR.game.player : null);
}

function syncBallView(ball, state, hidden) {
  const v = R.ballView;
  if (state) { v.group.position.set(state[0], state[1], state[2]); v.mesh.quaternion.set(state[3], state[4], state[5], state[6]); hidden = state[7]; }
  else { v.group.position.copy(ball.pos); v.mesh.quaternion.copy(ball.quat); }
  v.group.visible = !hidden;
  const p = v.group.position;
  v.shadow.visible = !hidden && p.y < 2000 && Math.abs(p.z) < ARENA.L;
  v.shadow.position.set(p.x, 1.4, p.z);
  const s = clamp(1 - p.y / 2200, 0.3, 1);
  v.shadow.scale.setScalar(0.6 + s * 0.4);
  v.shadow.material.opacity = 0.55 * s;
  // ball states
  if (ball.kind === 'dropshot') {
    const lv = ball.chargeLevel || 0;
    const col = ball.dsTeam === undefined || ball.dsTeam < 0 ? 0x000000 : TEAM_COLORS[ball.dsTeam].main;
    v.mat.emissive.set(col); v.mat.emissiveIntensity = 0.25 + lv * 0.45;
  } else if (ball.frozen > 0) { v.mat.emissive.set(0x66ccff); v.mat.emissiveIntensity = 0.7; }
  else if (CUR.game && CUR.game.mode === 'heatseeker' && CUR.game.heat.target >= 0) { v.mat.emissive.set(TEAM_COLORS[1 - CUR.game.heat.target].main); v.mat.emissiveIntensity = 0.45 + 0.15 * Math.sin(R.time * 10); }
  else { v.mat.emissive.set(0x3a3d44); v.mat.emissiveIntensity = 1; }
}

function syncPads(game, dt) {
  for (const v of R.padViews) {
    const p = v.p;
    v.orb.visible = p.active;
    v.ringMat.color.set(p.active ? 0xffb020 : 0x553a10);
    if (p.big && p.active) { v.orb.position.y = 85 + Math.sin(R.time * 2 + p.i) * 10; v.orb.rotation.y += dt; }
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function updateCamera(dt, game, replayFrame) {
  const C = R.cam, cam = R.camera;
  const car = game.player;
  const ball = game.ball;
  const S = Settings;
  if (replayFrame) {
    // cinematic replay camera: orbit-follow the ball
    const bp = tmpV(replayFrame.b[0], replayFrame.b[1], replayFrame.b[2]);
    const a = R.time * 0.25;
    const want = tmpV(bp.x + Math.cos(a) * 1300, Math.max(250, bp.y + 450), bp.z + Math.sin(a) * 1300 - sign(bp.z) * 600);
    keepInArena(want, 60);
    C.pos.lerp(want, damp(3, dt)); C.look.lerp(bp, damp(6, dt));
    cam.position.copy(C.pos); cam.up.set(0, 1, 0); cam.lookAt(C.look);
    return;
  }
  if (game.state === 'ended' || CUR.menuCam) {
    const a = R.time * 0.08;
    const want = tmpV(Math.cos(a) * 5200, 1500, Math.sin(a) * 6200);
    C.pos.lerp(want, damp(1, dt)); C.look.lerp(tmpV(0, 200, 0), damp(2, dt));
    cam.position.copy(C.pos); cam.up.set(0, 1, 0); cam.lookAt(C.look);
    return;
  }
  let focus = tmpV().copy(car.pos);
  if (car.demolished) {
    // spectate the ball from the death spot
    C.look.lerp(ball.pos, damp(4, dt));
    cam.position.copy(C.pos); cam.lookAt(C.look);
    return;
  }
  const carUp = car.up(tmpV());
  // on walls the camera leans with the car but stays partly upright (less disorienting)
  const wantUp = tmpV().copy(UP);
  if (car.onGround && car.groundN.y < 0.9 && car.groundN.y > -0.3) wantUp.lerp(car.groundN, 0.55).normalize();
  if (!car.onGround && car.wallTime > 0) wantUp.copy(UP);
  C.up.lerp(wantUp, damp(car.onGround ? 6 : 3, dt)).normalize();
  let dir;
  const tgtPos = game.ballHidden && game.lastGoalPos ? game.lastGoalPos : ball.pos;
  const useBall = C.ballCam && (!game.ballHidden || !!game.lastGoalPos);
  if (useBall) {
    dir = tmpV().copy(tgtPos).sub(car.pos);
    dir.addScaledVector(C.up, -dir.dot(C.up));
    if (dir.length() < 50) dir.copy(car.fwd(tmpV()));
    dir.normalize();
  } else {
    dir = car.fwd(tmpV());
    if (!car.onGround) { const v = tmpV().copy(car.vel); v.addScaledVector(C.up, -v.dot(C.up)); if (v.length() > 300) dir.copy(v); }
    dir.addScaledVector(C.up, -dir.dot(C.up));
    if (dir.lengthSq() < 1e-4) dir.copy(C.dir);
    dir.normalize();
  }
  const stiff = 2 + S.camStiffness * 14;
  C.dir.lerp(dir, damp(useBall ? stiff * 1.4 : stiff, dt)).normalize();
  const dist = S.camDist, height = S.camHeight;
  // right stick / R3 swivel (rear view)
  C.yaw = lerp(C.yaw || 0, Input.camYaw || 0, damp(12, dt));
  const camDir = (C.cd || (C.cd = new V3())).copy(C.dir);
  if (Math.abs(C.yaw) > 0.001) camDir.applyAxisAngle(C.up, -C.yaw);
  const pos = tmpV().copy(focus).addScaledVector(camDir, -dist).addScaledVector(C.up, height);
  keepInArena(pos, 40);
  C.pos.copy(pos);
  let look;
  if (useBall) {
    const tb = tmpV().copy(tgtPos).sub(focus);
    const ang = Math.atan2(tb.dot(C.up), Math.max(1, Math.hypot(tb.dot(C.dir), 0)));
    const lim = clamp(ang, -0.2, 0.75);
    look = tmpV().copy(focus).addScaledVector(C.up, 40).addScaledVector(C.dir, 300).addScaledVector(C.up, Math.tan(lim) * 300);
  } else {
    look = tmpV().copy(focus).addScaledVector(camDir, 300).addScaledVector(C.up, 40);
  }
  if (useBall && Math.abs(C.yaw) > 0.3) look = tmpV().copy(focus).addScaledVector(camDir, 300).addScaledVector(C.up, 40);
  look.addScaledVector(C.up, Math.tan(THREE.MathUtils.degToRad(S.camAngle)) * 300);
  C.look.copy(look);
  // shake
  if (S.camShake && C.shake > 0) {
    C.shake = Math.max(0, C.shake - dt * 2.5);
    const k = C.shake * C.shake * 25;
    C.pos.x += rand(-k, k); C.pos.y += rand(-k, k); C.pos.z += rand(-k, k);
  }
  cam.position.copy(C.pos); cam.up.copy(C.up); cam.lookAt(C.look);
  void carUp;
}
function keepInArena(p, margin) {
  for (let i = 0; i < 3; i++) {
    const d = arenaDist(p.x, p.y, p.z, false);
    if (d >= margin) return;
    const n = arenaNormal(p.x, p.y, p.z, false, tmpV());
    p.addScaledVector(n, margin - d);
  }
}

function renderFrame(dt, game, replayFrame) {
  R.time += dt;
  for (const d of R.dynamic) d.update(dt);
  if (game) {
    for (const [car, v] of R.carViews) syncCarView(car, v, replayFrame ? replayFrame.c[game.cars.indexOf(car)] : null);
    syncBallView(game.ball, replayFrame ? replayFrame.b : null, game.ballHidden);
    syncPads(game, dt);
    if (R.tileViews.length) updateTiles(dt);
  }
  if (typeof FX !== 'undefined') FX.update(dt, game);
  R.renderer.render(R.scene, R.camera);
}
