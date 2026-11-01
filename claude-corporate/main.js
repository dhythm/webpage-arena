"use strict";

document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// ---------------------------------------------------------------------------
// Hero: an as-cast concrete wall with kelp fibre, formwork seams and tie holes,
// lit by a low raking light that follows the pointer.
// ---------------------------------------------------------------------------
const VERT = `
attribute vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uLight;    // light position in px (y up)
uniform float uScale;   // px per unit
uniform float uTime;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ return vec2(hash(p), hash(p + 19.19)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return v;
}

// formwork panel: 3 x 1.5 units (≈ 1800 x 900 mm), tie holes on a 600 mm grid
const vec2 PANEL = vec2(3.0, 1.5);

// air voids (bugholes): small pits from a cell grid
float pits(vec2 p){
  vec2 c = floor(p * 9.0), f = fract(p * 9.0);
  float d = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y));
    vec2 h = hash2(c + o);
    if (h.x > 0.78){
      vec2 q = o + h - f;
      float r = 0.08 + 0.10 * h.y;
      d = max(d, smoothstep(r, r * 0.35, length(q)));
    }
  }
  return d;
}

// kelp fibres: short curved strands in random directions
float fibres(vec2 p){
  vec2 c = floor(p * 3.0), f = fract(p * 3.0);
  float m = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y));
    vec2 h = hash2(c + o + 7.0);
    float ang = h.x * 6.2831;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 q = f - o - h;
    float along = dot(q, dir);
    float across = dot(q, vec2(-dir.y, dir.x)) + 0.25 * along * along * (h.y - 0.5) * 4.0;
    float len = 0.18 + 0.22 * h.y;
    float s = smoothstep(len, len * 0.5, abs(along)) * smoothstep(0.03, 0.004, abs(across));
    m = max(m, s * step(0.72, h.y));
  }
  return m;
}

float height(vec2 p, out float fib, out float hole){
  // panel seams
  vec2 pp = p / PANEL;
  vec2 fp = fract(pp) * PANEL;
  float seam = min(min(fp.x, PANEL.x - fp.x), min(fp.y, PANEL.y - fp.y));
  float groove = smoothstep(0.012, 0.0, seam) * 0.6;
  // a slight lip where panels met unevenly
  float lip = smoothstep(0.05, 0.0, seam) * (hash(floor(pp)) - 0.5) * 0.12;
  // tie holes
  // tie holes sit between seams: centres at (0.5 + k, 0.375 + 0.75 j)
  vec2 tp = mod(p, vec2(1.0, 0.75)) - vec2(0.5, 0.375);
  float r = length(tp);
  hole = smoothstep(0.045, 0.040, r);
  float cone = smoothstep(0.046, 0.015, r) * 0.9;
  // surface: large waves from the form ply, fine sand grain, ply wood grain imprint
  float base = fbm(p * 0.7) * 0.35 + fbm(p * 5.0) * 0.08 + fbm(p * 23.0 + 3.1) * 0.022;
  float ply = fbm(vec2(p.x * 1.2, p.y * 9.0) + fbm(p * 1.7) * 1.5) * 0.025;
  fib = fibres(p + fbm(p * 1.3) * 0.2);
  float h = base + ply - groove + lip - cone - pits(p) * 0.2 + fib * 0.04;
  return h;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 p = frag / uScale + vec2(0.37, 0.21);
  float e = 1.2 / uScale;
  float fib, hole, f2, h2;
  float h0 = height(p, fib, hole);
  float hx = height(p + vec2(e, 0.0), f2, h2);
  float hy = height(p + vec2(0.0, e), f2, h2);
  vec3 n = normalize(vec3(-(hx - h0) / e * 0.22, -(hy - h0) / e * 0.22, 1.0));

  // albedo: warm grey concrete, cooler laitance blotches, olive-brown kelp fibre
  float blot = fbm(p * 1.4 + 4.0);
  vec3 alb = mix(vec3(0.50, 0.49, 0.46), vec3(0.62, 0.61, 0.58), blot);
  alb *= 0.93 + 0.1 * fbm(p * 18.0);
  alb = mix(alb, vec3(0.42, 0.38, 0.26), fib * 0.35);
  alb = mix(alb, vec3(0.08, 0.08, 0.07), hole);

  // raking light: a point light close to the wall
  vec3 lp = vec3(uLight / uScale + vec2(0.37, 0.21), 0.32);
  vec3 sp = vec3(p, h0 * 0.05);
  vec3 L = lp - sp;
  float dist = length(L);
  L /= dist;
  float diff = max(dot(n, L), 0.0);
  float att = 1.0 / (1.0 + dist * dist * 0.35);
  vec3 V = vec3(0.0, 0.0, 1.0);
  float spec = pow(max(dot(n, normalize(L + V)), 0.0), 40.0) * 0.08;
  vec3 lightCol = vec3(1.0, 0.94, 0.86);
  vec3 col = alb * (lightCol * diff * att * 1.9 + vec3(0.018, 0.019, 0.022)) + lightCol * spec * att;

  // tone map and grade towards the page's dark ink
  col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (hash(frag + fract(uTime)) - 0.5) / 255.0 * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`;

function createWall(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: false, powerPreference: "low-power" });
  } catch (_) {
    gl = null;
  }
  if (!gl) return null;
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("KAISŌ shader:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const name of ["uRes", "uLight", "uScale", "uTime"]) u[name] = gl.getUniformLocation(prog, name);

  let w = 1, h = 1, dpr = 1;
  function resize() {
    // the surface shader is heavy; 1.5x is plenty for a texture this busy
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * dpr));
    h = Math.max(1, Math.round(r.height * dpr));
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  function draw(lx, ly, time) {
    const cssW = w / dpr, cssH = h / dpr;
    // one formwork panel (1800 mm) spans about 70% of a desktop viewport
    const scale = Math.max(cssW, cssH * 1.4) / 3.2;
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uLight, lx * dpr, (cssH - ly) * dpr);
    gl.uniform1f(u.uScale, scale * dpr);
    gl.uniform1f(u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { resize, draw };
}

function initHero() {
  const hero = document.querySelector(".hero");
  const canvas = hero.querySelector(".hero-gl");
  const angleOut = hero.querySelector(".hero-angle");
  const wall = createWall(canvas);
  if (!wall) {
    document.documentElement.classList.add("no-gl");
    return;
  }
  wall.resize();

  // light position in CSS px from the hero's top-left
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  let visible = true;
  let raf = 0;
  let pointerActive = false;
  let t0 = performance.now();
  let skip = false;

  function rest() {
    const r = hero.getBoundingClientRect();
    return { x: r.width * 0.9, y: r.height * 0.08 };
  }
  Object.assign(target, rest());
  Object.assign(cur, target);

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const r = hero.getBoundingClientRect();
    if (!pointerActive && !reduceMotion.matches) {
      // idle: the light drifts slowly along the top of the wall
      const t = (now - t0) / 1000;
      target.x = r.width * (0.8 + 0.13 * Math.sin(t * 0.18));
      target.y = r.height * (0.10 + 0.06 * Math.sin(t * 0.23 + 1.0));
    }
    // idle drift is slow, so 30fps is enough and halves the GPU cost of this heavy shader
    skip = !skip;
    if (!pointerActive && skip) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const k = reduceMotion.matches ? 1 : pointerActive ? 0.06 : 0.12;
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    wall.draw(cur.x, cur.y, now / 1000);
    if (angleOut) {
      // elevation of the light above the wall plane, for the caption
      const dx = cur.x - r.width / 2, dy = cur.y - r.height / 2;
      const reach = Math.hypot(dx, dy) / Math.max(r.width, r.height);
      angleOut.textContent = `光の角度 ${Math.round(8 + 24 * (1 - Math.min(reach * 1.6, 1)))}°`;
    }
    const settling = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.5;
    if (!reduceMotion.matches || settling) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  hero.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = hero.getBoundingClientRect();
    pointerActive = true;
    target.x = e.clientX - r.left;
    target.y = e.clientY - r.top;
    kick();
  });
  hero.addEventListener("pointerleave", () => {
    pointerActive = false;
    kick();
  });
  new ResizeObserver(() => {
    wall.resize();
    if (!pointerActive) Object.assign(target, rest());
    kick();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) kick();
  }).observe(hero);
  document.addEventListener("visibilitychange", kick);
  kick();
}

// ---------------------------------------------------------------------------
// Header: transparent over the hero, solid afterwards; mobile menu
// ---------------------------------------------------------------------------
function initBar() {
  const bar = document.querySelector(".bar");
  const hero = document.querySelector(".hero");
  const menu = bar.querySelector(".menu");
  const nav = bar.querySelector(".nav");
  function update() {
    bar.classList.toggle("is-solid", window.scrollY > hero.offsetHeight - 80);
  }
  window.addEventListener("scroll", update, { passive: true });
  update();

  function setOpen(open) {
    menu.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    bar.classList.toggle("menu-open", open);
  }
  menu.addEventListener("click", () => setOpen(menu.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      menu.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Figures count up once when they enter the viewport
// ---------------------------------------------------------------------------
function initFigures() {
  const nums = [...document.querySelectorAll("[data-count]")];
  if (reduceMotion.matches || !("IntersectionObserver" in window)) return;
  const fmt = new Intl.NumberFormat("ja-JP");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const end = Number(el.dataset.count);
      const start = performance.now();
      const dur = 1400;
      (function step(now) {
        const t = Math.min((now - start) / dur, 1);
        const v = Math.round(end * (1 - Math.pow(1 - t, 3)));
        el.textContent = fmt.format(v);
        if (t < 1) requestAnimationFrame(step);
      })(start);
    }
  }, { threshold: 0.6 });
  nums.forEach((n) => io.observe(n));
}

// ---------------------------------------------------------------------------
// Material close-ups — procedural textures drawn once per size
// ---------------------------------------------------------------------------
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const textures = {
  // polished section through fibre-reinforced concrete: packed aggregate in a sandy paste
  crete(ctx, w, h) {
    const rnd = seeded(11);
    const unit = w / 900;
    ctx.fillStyle = "#b3aea4";
    ctx.fillRect(0, 0, w, h);
    // cement paste with sand: dense speckle
    for (let i = 0; i < 60000; i++) {
      const v = 140 + rnd() * 70;
      ctx.fillStyle = `rgba(${v | 0},${(v - 3) | 0},${(v - 9) | 0},${0.3 + rnd() * 0.4})`;
      const sz = (0.6 + rnd() * 1.6) * unit;
      ctx.fillRect(rnd() * w, rnd() * h, sz, sz);
    }
    // aggregate: river gravel, sawn flat. Placed largest first, avoiding overlap.
    const tones = [[124, 120, 112], [150, 142, 130], [104, 102, 98], [168, 160, 146], [136, 124, 108], [92, 90, 86]];
    const placed = [];
    for (let i = 0; i < 2200 && placed.length < 420; i++) {
      const r = (6 + Math.pow(rnd(), 2.2) * 40) * unit * (1 - placed.length / 600);
      const cx = rnd() * w, cy = rnd() * h;
      if (placed.some((q) => Math.hypot(q[0] - cx, q[1] - cy) < (q[2] + r) * 0.92)) continue;
      placed.push([cx, cy, r]);
      const tone = tones[Math.floor(rnd() * tones.length)];
      const pts = 9 + Math.floor(rnd() * 5);
      const rot = rnd() * Math.PI;
      const squash = 0.6 + rnd() * 0.4;
      ctx.beginPath();
      for (let k = 0; k < pts; k++) {
        const ang = (k / pts) * Math.PI * 2;
        const rr = r * (0.82 + rnd() * 0.22);
        const x0 = Math.cos(ang) * rr, y0 = Math.sin(ang) * rr * squash;
        const x = cx + x0 * Math.cos(rot) - y0 * Math.sin(rot);
        const y = cy + x0 * Math.sin(rot) + y0 * Math.cos(rot);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // mineral grain inside each stone
      for (let k = 0; k < r * r * 0.05 / unit; k++) {
        const v = rnd() < 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${v},${v},${v},${0.04 + rnd() * 0.06})`;
        const sz = (0.8 + rnd() * 2) * unit;
        ctx.fillRect(cx - r + rnd() * r * 2, cy - r + rnd() * r * 2, sz, sz);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(70,66,58,0.28)";
      ctx.lineWidth = 0.9 * unit;
      ctx.stroke();
    }
    // kelp fibre: fine, olive-brown, cut through at random angles
    ctx.lineCap = "round";
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h;
      const len = (6 + rnd() * 26) * unit;
      const a = rnd() * Math.PI * 2;
      const bend = (rnd() - 0.5) * len * 0.5;
      ctx.strokeStyle = `rgba(${86 + rnd() * 30 | 0},${70 + rnd() * 20 | 0},${30 + rnd() * 12 | 0},${0.7 + rnd() * 0.3})`;
      ctx.lineWidth = (0.9 + rnd() * 1.1) * unit;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.quadraticCurveTo((x + ex) / 2 + bend, (y + ey) / 2 - bend, ex, ey);
      ctx.stroke();
    }
    // a few air voids
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = rnd() * h, r = (1.5 + rnd() * 3.5) * unit;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, "rgba(40,38,34,0.9)");
      g.addColorStop(1, "rgba(90,86,80,0.6)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const v = ctx.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
    v.addColorStop(0, "rgba(255,252,244,0.12)");
    v.addColorStop(1, "rgba(20,18,14,0.28)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
  // pressed kelp insulation mat: fine fibres laid mostly in one direction
  board(ctx, w, h) {
    const rnd = seeded(5);
    const unit = w / 900;
    ctx.fillStyle = "#5e5132";
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    const layers = [
      { n: 5000, a: 0.45, light: 0.05, width: 1.3 },
      { n: 5000, a: 0.55, light: 0.3, width: 1.0 },
      { n: 3500, a: 0.7, light: 0.55, width: 0.8 },
      { n: 900, a: 0.8, light: 0.85, width: 0.6 },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.n; i++) {
        const x = rnd() * w * 1.1 - w * 0.05, y = rnd() * h;
        const len = (30 + rnd() * 140) * unit;
        const a = (rnd() - 0.5) * 0.7 + (rnd() < 0.5 ? 0 : Math.PI);
        const bend = (rnd() - 0.5) * 24 * unit;
        const l = layer.light + (rnd() - 0.5) * 0.2;
        const r = 110 + 110 * l, g = 94 + 100 * l, b = 52 + 74 * l;
        ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${layer.a * (0.4 + rnd() * 0.6)})`;
        ctx.lineWidth = (0.5 + rnd()) * layer.width * unit;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        ctx.bezierCurveTo(x + (ex - x) * 0.33, y + bend, x + (ex - x) * 0.66, ey - bend, ex, ey);
        ctx.stroke();
      }
    }
    // soft light from the upper left, as in a product photograph
    const v = ctx.createLinearGradient(0, 0, w, h);
    v.addColorStop(0, "rgba(255,244,214,0.16)");
    v.addColorStop(0.6, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(16,12,4,0.32)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
};

function initTextures() {
  const canvases = [...document.querySelectorAll("canvas[data-tex]")];
  function paint(c) {
    const draw = textures[c.dataset.tex];
    const r = c.getBoundingClientRect();
    if (!draw || !r.width) return;
    const s = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * s), h = Math.round(r.height * s);
    if (c.width === w && c.height === h) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    try {
      draw(ctx, w, h);
    } catch (err) {
      console.warn("KAISŌ texture:", err);
    }
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) paint(e.target);
  }, { rootMargin: "400px" });
  canvases.forEach((c) => io.observe(c));
  let t = 0;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => canvases.forEach(paint), 250);
  });
}

// ---------------------------------------------------------------------------
// Ledger filter
// ---------------------------------------------------------------------------
function initLedger() {
  const buttons = [...document.querySelectorAll(".ledger-filter button")];
  const rows = [...document.querySelectorAll(".ledger-table tbody tr")];
  buttons.forEach((btn) =>
    btn.addEventListener("click", () => {
      const f = btn.dataset.filter;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      rows.forEach((r) => (r.hidden = f !== "all" && r.dataset.kind !== f));
    }),
  );
}

// ---------------------------------------------------------------------------
// Sample request (demo, sends nothing)
// ---------------------------------------------------------------------------
function initContact() {
  const form = document.querySelector(".contact-form");
  if (!form) return;
  const msg = form.querySelector(".form-msg");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = ["org", "name", "email"].map((n) => form.elements[n]);
    let firstBad = null;
    for (const f of fields) {
      const ok = f.value.trim() !== "" && f.validity.valid;
      f.setAttribute("aria-invalid", String(!ok));
      if (!ok && !firstBad) firstBad = f;
    }
    const picked = [...form.querySelectorAll("input[name='sample']:checked")];
    msg.classList.remove("is-error");
    if (!picked.length) {
      msg.textContent = "サンプルを一つ以上選んでください。";
      msg.classList.add("is-error");
      return;
    }
    if (firstBad) {
      msg.textContent = "未入力、または形式の違う項目があります。";
      msg.classList.add("is-error");
      firstBad.focus();
      return;
    }
    msg.textContent = "（デモ）請求を受け付けたものとして表示しています。実際には送信されていません。";
    form.reset();
    fields.forEach((f) => f.removeAttribute("aria-invalid"));
  });
}

function safely(fn) {
  try {
    fn();
  } catch (err) {
    console.error(err);
  }
}
safely(initHero);
safely(initBar);
safely(initFigures);
safely(initTextures);
safely(initLedger);
safely(initContact);
