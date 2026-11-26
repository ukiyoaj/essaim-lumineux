/*!
 * Essaim lumineux — un essaim d'aiguilles de lumière qui suit le curseur.
 * Rendu WebGL, aucune dépendance.
 * (c) 2026 Amine Jebali (@ukiyoaj) — Licence MIT
 */
(() => {
  'use strict';

  /* ---------- Réglages ---------- */
  const AMBIANCES = [
    { id: 'emeraude', nom: 'Émeraude', couleurs: ['#3dff7a', '#a6ff3d', '#ffd84a', '#ff9a3d'] },
    { id: 'neon',     nom: 'Néon',     couleurs: ['#00e5ff', '#7a5cff', '#ff3df2', '#e8f6ff'] },
    { id: 'braise',   nom: 'Braise',   couleurs: ['#ff4d3d', '#ff8a3d', '#ffd23d', '#fff1b0'] },
    { id: 'glace',    nom: 'Glace',    couleurs: ['#7fd8ff', '#3d8bff', '#c9f2ff', '#ffffff'] },
    { id: 'sakura',   nom: 'Sakura',   couleurs: ['#ff8fb8', '#ffc2d6', '#c49bff', '#fff0f5'] },
    { id: 'or',       nom: 'Or',       couleurs: ['#ffcf3d', '#ffb000', '#fff3b0', '#ff7a00'] }
  ];
  const POIDS = [0.42, 0.26, 0.19, 0.13];       // part de chaque couleur
  const MOBILE = matchMedia('(hover: none)').matches || innerWidth < 700;
  const DEFAUT = {
    ambiance: 'emeraude',
    couleurs: AMBIANCES[0].couleurs.slice(),
    nombre: MOBILE ? 3000 : 7000,
    taille: 100,
    horloge: true
  };
  const CLE = 'essaim-lumineux:reglages';

  /* ---------- Éléments ---------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $('essaim');
  const ciel = $('ciel');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) { $('erreur').hidden = false; return; }

  /* ---------- Réglages sauvegardés ---------- */
  let reglages = Object.assign({}, DEFAUT);
  try {
    const s = JSON.parse(localStorage.getItem(CLE));
    if (s && Array.isArray(s.couleurs) && s.couleurs.length === 4) reglages = Object.assign(reglages, s);
  } catch (e) { /* stockage indisponible */ }
  const sauver = () => { try { localStorage.setItem(CLE, JSON.stringify(reglages)); } catch (e) {} };

  /* ---------- Shaders ---------- */
  const VS = `
    attribute vec2 aPos;
    attribute vec4 aCol;
    uniform vec2 uRes;
    varying vec4 vCol;
    void main() {
      vec2 p = aPos / uRes * 2.0 - 1.0;
      gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
      vCol = aCol;
    }`;
  const FS = `
    precision mediump float;
    varying vec4 vCol;
    void main() { gl_FragColor = vCol; }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aCol = gl.getAttribLocation(prog, 'aCol');
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aCol);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 24, 8);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);   // additif : les aiguilles brillent
  gl.clearColor(0, 0, 0, 0);

  /* ---------- Particules ---------- */
  let N = 0;
  let x, y, vx, vy, dx, dy, R, A, K, L, S, C, verts;
  const pal = new Float32Array(4 * 3);  // 4 couleurs RGB
  let W = 0, H = 0, dpr = 1, base = 0;

  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  function appliquerCouleurs() {
    reglages.couleurs.forEach((h, i) => pal.set(hexRgb(h), i * 3));
    const [r, g, b] = hexRgb(reglages.couleurs[0]).map((v) => Math.round(v * 255));
    const clair = (v) => Math.round(v + (255 - v) * 0.55);
    document.documentElement.style.setProperty('--accent', `rgb(${clair(r)},${clair(g)},${clair(b)})`);
    document.documentElement.style.setProperty('--glow', `rgba(${r},${g},${b},.5)`);
  }
  function choisirCouleur() {
    let r = Math.random();
    for (let i = 0; i < 4; i++) { if ((r -= POIDS[i]) <= 0) return i; }
    return 0;
  }
  function rayon() { return base * (reglages.taille / 100) * (0.09 + 0.26 * Math.sqrt(Math.random())); }

  function creer(n) {
    const ancien = N, ox = x, oy = y, ovx = vx, ovy = vy;
    N = n;
    x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    dx = new Float32Array(N); dy = new Float32Array(N); R = new Float32Array(N); A = new Float32Array(N);
    K = new Float32Array(N); L = new Float32Array(N); S = new Float32Array(N); C = new Uint8Array(N);
    verts = new Float32Array(N * 6 * 6);
    for (let i = 0; i < N; i++) {
      A[i] = Math.random() * Math.PI * 2;
      R[i] = rayon();
      K[i] = 6 + Math.random() * 16;
      S[i] = 0.6 + Math.random() * 0.9;
      L[i] = 6 + Math.random() * 9;
      C[i] = choisirCouleur();
      dx[i] = Math.cos(A[i]); dy[i] = Math.sin(A[i]);
      if (i < ancien) { x[i] = ox[i]; y[i] = oy[i]; vx[i] = ovx[i]; vy[i] = ovy[i]; }
      else {
        const a = Math.random() * Math.PI * 2, d = Math.max(W, H) * (0.6 + Math.random() * 0.6);
        x[i] = W / 2 + Math.cos(a) * d; y[i] = H / 2 + Math.sin(a) * d;
      }
    }
  }

  /* ---------- Taille de l'écran + ciel étoilé ---------- */
  function redimensionner() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; base = Math.min(W, H);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, W, H);
    ciel.width = canvas.width; ciel.height = canvas.height;
    const c = ciel.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(W * H / 4500);
    for (let i = 0; i < n; i++) {
      c.globalAlpha = 0.15 + Math.random() * 0.55;
      c.fillStyle = '#dfe6ff';
      const s = Math.random() * 1.3 + 0.3;
      c.fillRect(Math.random() * W, Math.random() * H * 0.85, s, s);
    }
    if (N) for (let i = 0; i < N; i++) R[i] = rayon();
  }

  /* ---------- Souris / doigt ---------- */
  const souris = { x: 0, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, derniere: -1e9, vitesse: 0 };
  const aide = $('aide');
  if (MOBILE) aide.textContent = 'Glisse ton doigt · touche pour disperser';
  function bouger(px, py) {
    souris.x = px; souris.y = py; souris.derniere = performance.now();
    aide.classList.add('off');
  }
  function disperser(px, py) {
    for (let i = 0; i < N; i++) {
      const ex = x[i] - px, ey = y[i] - py, d = Math.hypot(ex, ey) + 20;
      const f = (500 + Math.random() * 900) / Math.sqrt(d / 60);
      vx[i] += ex / d * f; vy[i] += ey / d * f;
    }
  }
  addEventListener('pointermove', (e) => bouger(e.clientX, e.clientY), { passive: true });
  canvas.addEventListener('pointerdown', (e) => { bouger(e.clientX, e.clientY); disperser(e.clientX, e.clientY); });
  canvas.addEventListener('dblclick', () => {
    try {
      const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  });
  addEventListener('resize', redimensionner);

  /* ---------- Simulation ---------- */
  let anneau = 1, rot = 0, t0 = performance.now(), temps = 0;

  function simuler(dt) {
    const idle = performance.now() - souris.derniere > 380 && souris.vitesse < 80;
    anneau += ((idle ? 1 : 0) - anneau) * (1 - Math.exp(-dt * (idle ? 1.8 : 6)));
    rot += dt * (0.35 + anneau * 0.25);
    temps += dt;
    const mx = souris.sx, my = souris.sy;
    const amort = 1.6 + anneau * 3.4;
    const raideur = 0.9 + anneau * 0.3;
    const contraction = anneau + (1 - anneau) * 0.45;
    const ondule = (1 - anneau) * 40;
    for (let i = 0; i < N; i++) {
      const a = A[i] + rot * S[i];
      const ca = Math.cos(a), sa = Math.sin(a);
      const rr = R[i] * contraction;
      const w = ondule * Math.sin(temps * 2 + i * 0.37);
      const tx = mx + ca * rr - sa * w;
      const ty = my + sa * rr + ca * w;
      const k = K[i] * raideur;
      vx[i] += ((tx - x[i]) * k - vx[i] * amort) * dt;
      vy[i] += ((ty - y[i]) * k - vy[i] * amort) * dt;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      // orientation : sens du mouvement, ou rayonnante quand l'essaim est au repos
      const v = Math.hypot(vx[i], vy[i]);
      let ux = v > 1 ? vx[i] / v : dx[i], uy = v > 1 ? vy[i] / v : dy[i];
      const wr = anneau * anneau * (v < 260 ? 1 : 0.3);
      ux = ux * (1 - wr) + ca * wr; uy = uy * (1 - wr) + sa * wr;
      const b = 1 - Math.exp(-dt * 12);
      let nx = dx[i] + (ux - dx[i]) * b, ny = dy[i] + (uy - dy[i]) * b;
      const n = Math.hypot(nx, ny) || 1;
      dx[i] = nx / n; dy[i] = ny / n;
    }
  }

  /* ---------- Dessin : chaque aiguille = 2 triangles, queue transparente, pointe claire ---------- */
  function dessiner() {
    let o = 0;
    const lw = MOBILE ? 1.4 : 1.25;
    for (let i = 0; i < N; i++) {
      const v = Math.hypot(vx[i], vy[i]);
      const len = L[i] * (1 + Math.min(1.8, v / 450));
      const ux = dx[i], uy = dy[i];
      const hx = x[i] + ux * len * 0.3, hy = y[i] + uy * len * 0.3;   // pointe
      const qx = x[i] - ux * len, qy = y[i] - uy * len;               // queue
      const px = -uy * lw, py = ux * lw;                                // demi-largeur
      const c = C[i] * 3;
      const r = pal[c], g = pal[c + 1], bl = pal[c + 2];
      const hr = r + (1 - r) * 0.2, hg = g + (1 - g) * 0.2, hb = bl + (1 - bl) * 0.2;
      // queue gauche, queue droite, pointe droite / queue gauche, pointe droite, pointe gauche
      o = v6(o, qx - px * 0.3, qy - py * 0.3, r, g, bl, 0.12);
      o = v6(o, qx + px * 0.3, qy + py * 0.3, r, g, bl, 0.12);
      o = v6(o, hx + px, hy + py, hr, hg, hb, 1);
      o = v6(o, qx - px * 0.3, qy - py * 0.3, r, g, bl, 0.12);
      o = v6(o, hx + px, hy + py, hr, hg, hb, 1);
      o = v6(o, hx - px, hy - py, hr, hg, hb, 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, N * 6);
  }
  function v6(o, px, py, r, g, b, a) {
    verts[o] = px; verts[o + 1] = py; verts[o + 2] = r; verts[o + 3] = g; verts[o + 4] = b; verts[o + 5] = a;
    return o + 6;
  }

  function boucle(t) {
    const dt = Math.min(0.05, (t - t0) / 1000);
    t0 = t;
    // le point suivi glisse vers la souris : pas d'à-coups
    const lisse = 1 - Math.exp(-dt * 14);
    souris.sx += (souris.x - souris.sx) * lisse;
    souris.sy += (souris.y - souris.sy) * lisse;
    const vit = Math.hypot(souris.x - souris.lx, souris.y - souris.ly) / Math.max(dt, 0.001);
    souris.lx = souris.x; souris.ly = souris.y;
    souris.vitesse += (vit - souris.vitesse) * Math.min(1, dt * 6);
    // sous-pas : simulation stable même à 30 i/s
    const pas = dt > 1 / 50 ? 2 : 1;
    for (let p = 0; p < pas; p++) simuler(dt / pas);
    dessiner();
    requestAnimationFrame(boucle);
  }

  /* ---------- Horloge ---------- */
  const heure = $('heure'), date = $('date');
  const deux = (n) => String(n).padStart(2, '0');
  function tic() {
    const d = new Date();
    heure.innerHTML = `${deux(d.getHours())}:${deux(d.getMinutes())}<span>:${deux(d.getSeconds())}</span>`;
    date.textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    setTimeout(tic, 1000 - d.getMilliseconds() + 5);
  }

  /* ---------- Panneau de personnalisation ---------- */
  const panneau = $('panneau'), ouvrir = $('ouvrir');
  const presets = $('presets'), perso = $('perso');
  const nombre = $('nombre'), taille = $('taille'), voirHorloge = $('voir-horloge');

  presets.innerHTML = AMBIANCES.map((a) =>
    `<button class="preset" data-id="${a.id}" aria-pressed="false"><i style="background:linear-gradient(90deg,${a.couleurs.join(',')})"></i>${a.nom}</button>`
  ).join('');
  perso.innerHTML = [0, 1, 2, 3].map((i) => `<input type="color" data-i="${i}" aria-label="Couleur ${i + 1}">`).join('');

  function majPanneau() {
    presets.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === reglages.ambiance)));
    perso.querySelectorAll('input').forEach((inp) => { inp.value = reglages.couleurs[+inp.dataset.i]; });
    nombre.value = reglages.nombre; $('nombre-val').textContent = Number(reglages.nombre).toLocaleString('fr-FR');
    taille.value = reglages.taille; $('taille-val').textContent = reglages.taille + ' %';
    voirHorloge.checked = reglages.horloge;
    $('horloge').classList.toggle('cachee', !reglages.horloge);
  }
  function basculer(ouvert) {
    panneau.hidden = !ouvert;
    ouvrir.setAttribute('aria-expanded', String(ouvert));
  }
  ouvrir.addEventListener('click', () => basculer(panneau.hidden));
  $('fermer').addEventListener('click', () => basculer(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') basculer(false); });

  presets.addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (!b) return;
    const a = AMBIANCES.find((p) => p.id === b.dataset.id);
    reglages.ambiance = a.id;
    reglages.couleurs = a.couleurs.slice();
    appliquerCouleurs(); majPanneau(); sauver();
  });
  perso.addEventListener('input', (e) => {
    reglages.couleurs[+e.target.dataset.i] = e.target.value;
    reglages.ambiance = 'perso';
    appliquerCouleurs(); majPanneau(); sauver();
  });
  nombre.addEventListener('input', () => {
    reglages.nombre = +nombre.value;
    creer(reglages.nombre); majPanneau(); sauver();
  });
  taille.addEventListener('input', () => {
    reglages.taille = +taille.value;
    for (let i = 0; i < N; i++) R[i] = rayon();
    majPanneau(); sauver();
  });
  voirHorloge.addEventListener('change', () => { reglages.horloge = voirHorloge.checked; majPanneau(); sauver(); });
  $('reset').addEventListener('click', () => {
    reglages = Object.assign({}, DEFAUT, { couleurs: DEFAUT.couleurs.slice() });
    creer(reglages.nombre); for (let i = 0; i < N; i++) R[i] = rayon();
    appliquerCouleurs(); majPanneau(); sauver();
  });

  /* ---------- Démarrage ---------- */
  redimensionner();
  souris.x = souris.sx = souris.lx = W / 2;
  souris.y = souris.sy = souris.ly = H * 0.42;
  creer(reglages.nombre);
  appliquerCouleurs();
  majPanneau();
  tic();
  requestAnimationFrame(boucle);
})();
