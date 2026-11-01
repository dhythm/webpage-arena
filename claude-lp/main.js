"use strict";

document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// ---------------------------------------------------------------------------
// Dawn model: minutes 0..30 → brightness, colour temperature, lux.
// Light rises slowly at first and quickly in the last ten minutes.
// ---------------------------------------------------------------------------
function dawnAt(minutes) {
  const t = Math.min(Math.max(minutes / 30, 0), 1);
  const glow = 0.04 + 0.96 * Math.pow(t, 1.7);
  const kelvin = 1800 + 2200 * Math.pow(t, 1.15);
  const lux = Math.max(1, Math.round(250 * Math.pow(t, 2.2)));
  return { t, glow, kelvin, lux };
}

function formatClock(minutes) {
  const m = Math.min(30, Math.floor(minutes + 1e-6));
  return `6:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Hero lamp — a fragment shader draws the wall, the washi shade and its light.
// ---------------------------------------------------------------------------
const VERT = `
attribute vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uLamp;      // lamp centre in px (y up)
uniform float uSize;     // shade half-height in px
uniform float uGlow;     // 0..1 brightness
uniform vec3 uLight;     // light colour (linear)
uniform float uTime;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// rounded box SDF
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

void main(){
  vec2 frag = gl_FragCoord.xy;
  float s = uSize;
  vec2 p = (frag - uLamp) / s;               // lamp space: shade spans y -1..1
  vec2 uv = frag / uRes;

  // --- shade geometry: a soft lantern, slightly wider at the shoulder
  float taper = 1.0 - 0.08 * smoothstep(-1.0, 1.0, p.y);
  vec2 sp = vec2(p.x / taper, p.y);
  float dShade = sdBox(sp, vec2(0.64, 1.0), 0.30);
  // base (wood), sitting under the shade
  vec2 bp = p - vec2(0.0, -1.16);
  float dBase = sdBox(bp, vec2(0.56, 0.13), 0.06);
  float tableY = -1.29;

  float g = uGlow;
  vec3 L = uLight;

  // --- wall: night blue lifted by lamp light
  vec3 night = vec3(0.012, 0.012, 0.03);
  float wallTex = fbm(frag * 0.004) * 0.6 + fbm(frag * 0.05) * 0.4;
  vec3 wall = night * (0.85 + 0.3 * wallTex);
  float d = length((frag - uLamp) / s * vec2(0.85, 1.0));
  float fall = 1.0 / (1.0 + 0.55 * d * d);
  vec3 wallLit = vec3(0.80, 0.78, 0.76) * L * g * (1.25 * fall + 0.06) * (0.92 + 0.12 * wallTex);
  wall += wallLit;
  // the room lifts as the morning comes
  wall += vec3(0.26, 0.26, 0.27) * L * pow(g, 2.0) * 0.24;

  // --- table / floor plane below the base
  if (p.y < tableY){
    float depth = (tableY - p.y);
    vec3 table = vec3(0.020, 0.018, 0.026);
    float pool = exp(-pow(p.x / (1.9 + depth * 0.8), 2.0) - depth * 0.9);
    vec3 tableLit = vec3(0.70, 0.56, 0.42) * L * g * (0.9 * pool + 0.08);
    // contact shadow under the base
    float ao = smoothstep(0.0, 0.35, depth) * 0.5 + 0.5;
    float aoX = smoothstep(0.5, 1.3, abs(p.x));
    tableLit *= mix(ao, 1.0, aoX);
    wall = mix(wall, table + tableLit, smoothstep(0.0, 0.03, depth) * 0.85 * exp(-pow(p.x / 3.2, 2.0)));
    // edge highlight of the table, only near the lamp
    wall += L * g * 0.06 * exp(-depth * 30.0) * exp(-p.x * p.x * 0.4);
  }

  vec3 col = wall;

  // --- bloom around the shade
  float outside = max(dShade, 0.0);
  col += L * g * (0.55 * exp(-outside * 3.2) + 0.25 * exp(-outside * 0.9));

  // --- wooden base
  float baseMask = 1.0 - smoothstep(-0.006, 0.006, dBase);
  if (baseMask > 0.0){
    vec2 wq = bp * vec2(1.0, 7.0);
    float grain = fbm(vec2(wq.x * 1.4 + fbm(wq * 1.2) * 1.6, wq.y * 0.6) * 3.0);
    float rings = sin((bp.x * 9.0 + grain * 6.0)) * 0.5 + 0.5;
    vec3 wood = mix(vec3(0.42, 0.25, 0.12), vec3(0.62, 0.42, 0.23), grain * 0.7 + rings * 0.3);
    // light from the shade hits the top edge; front face mostly ambient
    float top = smoothstep(-0.02, 0.12, bp.y);
    vec3 woodLit = wood * (0.03 + L * g * (0.25 + 0.95 * top));
    woodLit += wood * vec3(0.04, 0.04, 0.06) * (1.0 - g);
    float rim = exp(-abs(dBase) * 80.0) * smoothstep(0.0, 0.13, bp.y);
    woodLit += L * g * rim * 0.35;
    // brass dial on the front of the base
    vec2 dp = bp - vec2(0.36, -0.01);
    float dial = 1.0 - smoothstep(0.050, 0.058, length(dp));
    vec3 brass = vec3(0.55, 0.40, 0.17) * (0.12 + L * g * (0.5 + 0.8 * smoothstep(0.03, -0.04, dp.y)));
    brass += L * g * 0.6 * exp(-length(dp - vec2(-0.015, 0.02)) * 90.0);
    woodLit = mix(woodLit, brass, dial);
    col = mix(col, woodLit, baseMask);
  }

  // --- washi shade
  float shadeMask = 1.0 - smoothstep(-0.008, 0.008, dShade);
  if (shadeMask > 0.0){
    // long kozo fibres: stretched noise plus a few bright strands
    vec2 fq = sp * vec2(3.2, 3.2);
    float fibre = fbm(fq * vec2(1.0, 0.35) * 6.0 + fbm(fq * 2.0) * 1.5);
    float strands = pow(abs(sin(fbm(fq * vec2(0.9, 2.4) * 3.0) * 22.0)), 18.0);
    float clouds = fbm(fq * 1.6 + 3.0);
    float thick = 0.62 + 0.55 * clouds + 0.22 * fibre - 0.25 * strands;
    // hot core of the bulb, softened by paper
    float core = exp(-dot(sp * vec2(1.1, 0.75), sp * vec2(1.1, 0.75)) * 1.6);
    float edge = smoothstep(0.0, -0.32, dShade);           // darker near the curved edge
    float cyl = sqrt(max(1.0 - pow(sp.x / 0.66, 2.0), 0.0)); // cylinder: thinner paper path at the centre
    // two bamboo hoops seen through the paper, curved by perspective
    float ry = sp.y + 0.06 * sp.x * sp.x;
    float ribs = exp(-pow((ry - 0.42) * 38.0, 2.0)) + exp(-pow((ry + 0.38) * 38.0, 2.0));
    float trans = (0.30 + 1.25 * core) * mix(0.45, 1.0, edge) * (0.55 + 0.45 * cyl) * (1.15 - 0.5 * thick) * (1.0 - 0.22 * ribs);
    vec3 lit = L * g * trans * 1.75;
    // unlit paper catches a little room light
    vec3 paper = vec3(0.92, 0.88, 0.80) * (0.035 + 0.02 * fibre) * (1.0 - g * 0.6);
    vec3 shade = paper + lit;
    // rim where the paper folds over the frame
    shade += L * g * 0.30 * exp(-abs(dShade) * 70.0);
    // a darker paper fold at the top and bottom rims
    float fold = smoothstep(0.90, 1.0, abs(sp.y));
    shade *= 1.0 - 0.35 * fold;
    col = mix(col, shade, shadeMask);
  }

  // vignette and filmic tone map
  vec2 vv = uv - 0.5;
  col *= 1.0 - 0.45 * dot(vv, vv);
  col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  // grain dithers away gradient banding
  col += (hash(frag + fract(uTime)) - 0.5) / 255.0 * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// Approximate black-body colour (Tanner Helland), returned in linear RGB 0..1.
function kelvinToLinear(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const lin = (v) => Math.pow(Math.min(Math.max(v, 0), 255) / 255, 2.2);
  return [lin(r), lin(g), lin(b)];
}

function createLamp(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
  } catch (_) {
    gl = null;
  }
  if (!gl) return null;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("TOKI shader:", gl.getShaderInfoLog(sh));
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
  for (const name of ["uRes", "uLamp", "uSize", "uGlow", "uLight", "uTime"]) u[name] = gl.getUniformLocation(prog, name);

  let w = 0, h = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  function draw(state, time) {
    const cssW = w / dpr, cssH = h / dpr;
    const narrow = cssW < 760;
    // The lamp sits right of the copy on wide screens, bottom-right on phones.
    // On phones the lamp stands beside the vertical headline.
    const cx = narrow ? cssW * 0.74 : cssW * 0.73;
    const cyFromTop = narrow ? 92 + Math.min(cssH * 0.23, 190) : cssH * 0.44;
    const size = narrow ? Math.min(cssW * 0.17, 78) : Math.min(cssH * 0.24, cssW * 0.13);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uLamp, cx * dpr, (cssH - cyFromTop) * dpr);
    gl.uniform1f(u.uSize, size * dpr);
    gl.uniform1f(u.uGlow, state.glow);
    // the very low end of the black-body curve reads as red on screen; keep it amber
    gl.uniform3fv(u.uLight, kelvinToLinear(Math.max(state.kelvin, 2150)));
    gl.uniform1f(u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { resize, draw };
}

// ---------------------------------------------------------------------------
// Hero controller: slider, autoplay, tone switching
// ---------------------------------------------------------------------------
function initHero() {
  const hero = document.querySelector(".hero");
  const canvas = hero.querySelector(".hero-gl");
  const range = hero.querySelector("#dawn");
  const play = hero.querySelector(".dawn-play");
  const out = {
    time: hero.querySelector(".dawn-time"),
    k: hero.querySelector(".dawn-k"),
    lx: hero.querySelector(".dawn-lx"),
  };
  const lamp = createLamp(canvas);
  if (!lamp) document.documentElement.classList.add("no-gl");

  let minutes = 0;
  let playing = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  const DURATION = 9000; // a 30 minute dawn in nine seconds

  function setMinutes(m, fromInput) {
    minutes = Math.min(Math.max(m, 0), 30);
    const st = dawnAt(minutes);
    if (!fromInput) range.value = minutes.toFixed(1);
    range.style.setProperty("--p", `${(minutes / 30) * 100}%`);
    const clock = formatClock(minutes);
    out.time.textContent = clock;
    out.k.textContent = `${Math.round(st.kelvin / 100) * 100}`.replace(/\B(?=(\d{3})+$)/, ",") + "K";
    out.lx.textContent = `${st.lux} lx`;
    const phase = minutes < 8 ? "灯りはじめ" : minutes < 18 ? "壁が見えてくる" : minutes < 26 ? "白くなる" : "起きる時間";
    range.setAttribute("aria-valuetext", `${clock.replace(":", "時")}分、${phase}`);
    // switch to dark text as soon as the wall behind the copy is brighter than mid-grey
    const lit = st.t > 0.67;
    hero.classList.toggle("is-lit", lit);
    document.querySelector(".bar").classList.toggle("on-day", lit && window.scrollY < 40);
    requestDraw();
  }

  let pending = false;
  function requestDraw() {
    if (pending || !lamp) return;
    pending = true;
    requestAnimationFrame((now) => {
      pending = false;
      if (visible) lamp.draw(dawnAt(minutes), now / 1000);
    });
  }

  function tick(now) {
    if (!playing) return;
    const dt = last ? now - last : 16;
    last = now;
    setMinutes(minutes + (dt / DURATION) * 30);
    if (minutes >= 30) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (minutes >= 30) setMinutes(0);
    playing = true;
    last = 0;
    play.setAttribute("aria-pressed", "true");
    play.setAttribute("aria-label", "夜明けを一時停止");
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    playing = false;
    play.setAttribute("aria-pressed", "false");
    play.setAttribute("aria-label", "夜明けを再生");
    cancelAnimationFrame(raf);
  }

  play.setAttribute("aria-pressed", "false");
  play.addEventListener("click", () => (playing ? stop() : start()));
  range.addEventListener("input", () => {
    stop();
    setMinutes(parseFloat(range.value), true);
  });

  if (lamp) {
    lamp.resize();
    new ResizeObserver(() => {
      lamp.resize();
      requestDraw();
    }).observe(canvas);
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible && playing) stop();
      if (visible) requestDraw();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing) stop();
  });

  if (reduceMotion.matches) {
    // No autoplay: show the lamp mid-dawn so the light is visible at once.
    setMinutes(22);
  } else {
    setMinutes(0);
    setTimeout(() => {
      if (minutes === 0 && !document.hidden) start();
    }, 900);
  }
}

// ---------------------------------------------------------------------------
// Header tone: transparent on the hero, frosted afterwards, dark over night sections
// ---------------------------------------------------------------------------
function initBar() {
  const bar = document.querySelector(".bar");
  const nights = [...document.querySelectorAll("main [data-tone='night']")];
  function update() {
    const y = window.scrollY;
    const hero = document.querySelector(".hero");
    const solid = y > hero.offsetHeight - 80;
    bar.classList.toggle("is-solid", solid);
    const probe = 34;
    const overNight = nights.some((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    });
    bar.classList.toggle("on-night", solid && overNight);
    if (y >= 40) bar.classList.remove("on-day");
    else bar.classList.toggle("on-day", hero.classList.contains("is-lit"));
  }
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

// ---------------------------------------------------------------------------
// Material swatches — procedural textures drawn once per size
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
  washi(ctx, w, h) {
    const rnd = seeded(7);
    // backlit paper: warm glow from behind, brighter in the middle
    const g = ctx.createRadialGradient(w * 0.55, h * 0.42, 0, w * 0.55, h * 0.42, Math.max(w, h) * 0.75);
    g.addColorStop(0, "#fff6e4");
    g.addColorStop(0.45, "#f6dfb6");
    g.addColorStop(1, "#d8a46a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // cloudy thickness
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90;
      const c = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.5;
      c.addColorStop(0, dark ? "rgba(190,130,60,0.035)" : "rgba(255,250,240,0.12)");
      c.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = c;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // kozo fibres
    ctx.lineCap = "round";
    for (let i = 0; i < 2200; i++) {
      const x = rnd() * w, y = rnd() * h;
      const len = 30 + rnd() * 180;
      const a = rnd() * Math.PI * 2;
      const bend = (rnd() - 0.5) * 60;
      const dark = rnd() < 0.55;
      ctx.strokeStyle = dark ? `rgba(160,105,50,${0.04 + rnd() * 0.08})` : `rgba(255,252,244,${0.14 + rnd() * 0.32})`;
      ctx.lineWidth = 0.4 + rnd() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.quadraticCurveTo((x + ex) / 2 + bend, (y + ey) / 2 - bend, ex, ey);
      ctx.stroke();
    }
    // a bamboo rib shadow
    ctx.fillStyle = "rgba(120,70,30,0.10)";
    ctx.fillRect(0, h * 0.28, w, 5);
    ctx.filter = "blur(6px)";
    ctx.fillRect(0, h * 0.28 - 4, w, 14);
    ctx.filter = "none";
  },
  wood(ctx, w, h) {
    const rnd = seeded(21);
    // quarter-sawn hinoki: pale, straight grain that drifts slightly
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    const unit = w / 420;
    for (let y = 0; y < h; y++) {
      const drift = Math.sin(y / h * 2.2 + ph[0]) * 14 * unit + Math.sin(y / h * 7.1 + ph[1]) * 3 * unit;
      for (let x = 0; x < w; x++) {
        const xx = (x + drift) / unit;
        const phase = xx * 0.16 + 2.6 * Math.sin(xx * 0.012 + ph[2]) + 1.1 * Math.sin(xx * 0.041 + ph[3]);
        const late = Math.pow(Math.abs(Math.sin(phase)), 22);       // dark latewood line
        const band = 0.5 + 0.5 * Math.sin(xx * 0.035 + ph[1]);      // broad tone bands
        const fibre = Math.sin(xx * 2.3 + Math.sin(y * 0.02) * 2) * 0.5 + 0.5;
        const k = 1 - late * 0.2 - band * 0.05 - fibre * 0.025;
        const i = (y * w + x) * 4;
        d[i] = 232 * k;
        d[i + 1] = 200 * k - late * 8;
        d[i + 2] = 152 * k - late * 14;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // beeswax sheen from the upper left
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(255,246,228,0.28)");
    g.addColorStop(0.55, "rgba(255,246,228,0)");
    g.addColorStop(1, "rgba(110,60,20,0.16)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  brass(ctx, w, h) {
    const cx = w * 0.5, cy = h * 0.38, R = Math.min(w, h) * 0.34;
    // dark walnut-ish backdrop with warm light
    const bg = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.max(w, h));
    bg.addColorStop(0, "#5a4024");
    bg.addColorStop(1, "#22170d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = R * 0.35;
    ctx.shadowOffsetY = R * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#a98848";
    ctx.fill();
    ctx.restore();
    // brushed face: conic sweep
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1.5) / steps) * Math.PI * 2;
      const l = 0.55 + 0.35 * Math.cos(a0 * 2 - 0.8) + 0.08 * Math.sin(i * 12.9898);
      ctx.fillStyle = `rgb(${Math.round(150 + 95 * l)},${Math.round(112 + 80 * l)},${Math.round(52 + 50 * l)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R * 0.86, a0, a1);
      ctx.fill();
    }
    // concentric turning marks
    for (let r = 4; r < R * 0.86; r += 2.2) {
      ctx.strokeStyle = `rgba(${r % 3 < 1.2 ? "255,240,200" : "80,55,20"},0.05)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // knurled ring
    const teeth = 120;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const l = 0.5 + 0.45 * Math.cos(a - 2.2);
      ctx.strokeStyle = i % 2 ? `rgba(60,40,15,${0.5 - l * 0.3})` : `rgba(255,232,180,${0.15 + l * 0.5})`;
      ctx.lineWidth = (Math.PI * 2 * R) / teeth * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.87, cy + Math.sin(a) * R * 0.87);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    // index mark
    ctx.strokeStyle = "rgba(40,25,8,0.75)";
    ctx.lineWidth = Math.max(2, R * 0.025);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 0.78);
    ctx.lineTo(cx, cy - R * 0.55);
    ctx.stroke();
    // specular highlight
    const sp = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 0.7);
    sp.addColorStop(0, "rgba(255,248,225,0.55)");
    sp.addColorStop(1, "rgba(255,248,225,0)");
    ctx.fillStyle = sp;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  },
};

function initSwatches() {
  const canvases = [...document.querySelectorAll("canvas[data-tex]")];
  function paint(c) {
    const draw = textures[c.dataset.tex];
    if (!draw) return;
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // the wood loop touches every pixel, so keep it at 1x
    const scale = c.dataset.tex === "wood" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * scale), h = Math.round(rect.height * scale);
    if (c.width === w && c.height === h) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    try {
      draw(ctx, w, h);
    } catch (err) {
      console.warn("TOKI texture:", err);
    }
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) paint(e.target);
  }, { rootMargin: "400px" });
  canvases.forEach((c) => io.observe(c));
  let t = 0;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => canvases.forEach(paint), 200);
  });
}

// ---------------------------------------------------------------------------
// Reservation dialog (demo, sends nothing)
// ---------------------------------------------------------------------------
function initReserve() {
  const dialog = document.getElementById("reserve");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const form = dialog.querySelector(".reserve-form");
  const done = dialog.querySelector(".reserve-done");
  const error = dialog.querySelector(".reserve-error");
  const finishName = dialog.querySelector("[data-finish-name]");

  document.querySelectorAll("[data-open='reserve']").forEach((btn) =>
    btn.addEventListener("click", () => {
      const checked = document.querySelector("input[name='finish']:checked");
      finishName.textContent = checked && checked.value === "sumi" ? "墨" : "白木";
      form.hidden = false;
      done.hidden = true;
      error.hidden = true;
      dialog.showModal();
    }),
  );
  dialog.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.elements.name;
    const email = form.elements.email;
    const problems = [];
    if (!name.value.trim()) problems.push("お名前を入力してください。");
    if (!email.validity.valid || !email.value.trim()) problems.push("メールアドレスの形式を確認してください。");
    if (problems.length) {
      error.textContent = problems.join(" ");
      error.hidden = false;
      (problems[0].startsWith("お名前") ? name : email).focus();
      return;
    }
    form.hidden = true;
    done.hidden = false;
    form.reset();
    done.querySelector("button").focus();
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
safely(initSwatches);
safely(initReserve);
