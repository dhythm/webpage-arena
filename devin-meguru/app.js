/* MEGURU — 動く万華鏡
   ソース面に漂う欠片を描き、鏡のセグメント数だけ回転・反転して複写する。
   ドラッグで筒が回り、中身（オブジェクト室）を切り替えられる。 */

(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- 万華鏡 ---------- */

  const canvas = document.getElementById("scope");
  const ctx = canvas.getContext("2d");
  const src = document.createElement("canvas");
  const sctx = src.getContext("2d");
  const SRC = 640;
  src.width = src.height = SRC;

  const SEGMENTS = 14;
  const STEP = (Math.PI * 2) / SEGMENTS;

  /* オブジェクト室の中身ごとの欠片セット */
  const CHAMBERS = {
    glass: {
      shape: "shard",
      count: 130,
      size: [14, 52],
      colors: ["#7fd0c9", "#5a8fd0", "#e0a75e", "#cfe0e6", "#4a6fb5", "#d7695a"],
      alpha: [0.5, 0.9],
      drift: 1,
    },
    hana: {
      shape: "petal",
      count: 85,
      size: [16, 58],
      colors: ["#c9507a", "#e088a0", "#d9a441", "#8a5f9e", "#e6e0d2", "#b0653f"],
      alpha: [0.45, 0.85],
      drift: 0.55,
    },
    konpeito: {
      shape: "star",
      count: 170,
      size: [8, 24],
      colors: ["#f2b6c9", "#a8d8c8", "#f5e08a", "#b5aee0", "#f0937a", "#f4f1ea"],
      alpha: [0.55, 0.95],
      drift: 1.4,
    },
  };

  let chamber = "glass";
  let speed = 1;
  let tubeAngle = 0.25;
  let running = !reduceMotion.matches;
  let particles = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function buildParticles() {
    const c = CHAMBERS[chamber];
    particles = Array.from({ length: c.count }, () => ({
      x: rand(0, SRC),
      y: rand(0, SRC),
      vx: rand(-9, 9) * c.drift,
      vy: rand(4, 16) * c.drift,
      size: rand(c.size[0], c.size[1]),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.35, 0.35) * c.drift,
      color: pick(c.colors),
      alpha: rand(c.alpha[0], c.alpha[1]),
      shape: c.shape,
      sides: 3 + ((Math.random() * 3) | 0),
    }));
  }

  function drawShard(g, p) {
    g.beginPath();
    for (let i = 0; i < p.sides; i++) {
      const a = (i / p.sides) * Math.PI * 2;
      const r = p.size * (0.55 + 0.45 * Math.sin(i * 7.3 + p.rot));
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  }

  function drawPetal(g, p) {
    g.beginPath();
    g.ellipse(0, 0, p.size * 0.45, p.size, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = p.alpha * 0.5;
    g.beginPath();
    g.ellipse(p.size * 0.35, p.size * 0.4, p.size * 0.28, p.size * 0.6, 0.7, 0, Math.PI * 2);
    g.fill();
  }

  function drawStar(g, p) {
    const spikes = 6;
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 ? p.size * 0.45 : p.size;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  }

  function drawSource(dt) {
    sctx.clearRect(0, 0, SRC, SRC);
    const g = sctx.createRadialGradient(SRC / 2, SRC / 2, 0, SRC / 2, SRC / 2, SRC / 2);
    g.addColorStop(0, "#161c2b");
    g.addColorStop(1, "#0a0d15");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, SRC, SRC);

    sctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      if (running) {
        p.x += p.vx * dt * speed;
        p.y += p.vy * dt * speed;
        p.rot += p.vr * dt * speed;
        if (p.x < -50) p.x += SRC + 100;
        if (p.x > SRC + 50) p.x -= SRC + 100;
        if (p.y < -50) p.y += SRC + 100;
        if (p.y > SRC + 50) p.y -= SRC + 100;
      }
      sctx.save();
      sctx.translate(p.x, p.y);
      sctx.rotate(p.rot);
      sctx.globalAlpha = p.alpha;
      sctx.fillStyle = p.color;
      if (p.shape === "shard") drawShard(sctx, p);
      else if (p.shape === "petal") drawPetal(sctx, p);
      else drawStar(sctx, p);
      sctx.restore();
    }
    sctx.globalCompositeOperation = "source-over";
    sctx.globalAlpha = 1;
  }

  function drawScope() {
    const w = canvas.width;
    const R = w / 2;
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = "#0a0d15";
    ctx.fillRect(0, 0, w, w);

    ctx.save();
    ctx.translate(R, R);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();

    for (let i = 0; i < SEGMENTS; i++) {
      ctx.save();
      ctx.rotate(tubeAngle + i * STEP);
      if (i % 2) ctx.scale(1, -1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, -STEP / 2, STEP / 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(src, -R, -R, w, w);
      ctx.restore();
    }

    /* 鏡の境目にほのかな輝線 */
    ctx.strokeStyle = "rgba(235,229,216,0.10)";
    ctx.lineWidth = Math.max(1, w / 900);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = tubeAngle + (i + 0.5) * STEP;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.stroke();
    }

    /* 対眼レンズの暗縁 */
    const v = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.85, "rgba(0,0,0,0.28)");
    v.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = v;
    ctx.fillRect(-R, -R, w, w);
    ctx.restore();
  }

  function fit() {
    const css = canvas.getBoundingClientRect().width;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (canvas.width !== px) {
      canvas.width = canvas.height = px;
      drawScope();
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    drawSource(dt);
    if (running) tubeAngle += dt * 0.045 * speed;
    drawScope();
    requestAnimationFrame(frame);
  }

  /* ドラッグで筒を回す */
  let dragging = false;
  let lastPointerAngle = 0;

  function pointerAngle(e) {
    const r = canvas.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastPointerAngle = pointerAngle(e);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const a = pointerAngle(e);
    let d = a - lastPointerAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    tubeAngle += d;
    lastPointerAngle = a;
    if (!running) {
      drawSource(0);
      drawScope();
    }
  });
  canvas.addEventListener("pointerup", () => (dragging = false));
  canvas.addEventListener("pointercancel", () => (dragging = false));

  /* 中身の切り替え */
  document.getElementById("chambers").addEventListener("change", (e) => {
    if (e.target.name === "chamber") {
      chamber = e.target.value;
      buildParticles();
      drawSource(0);
      drawScope();
      const sel = document.getElementById("r-chamber");
      if (sel) sel.value = chamber;
    }
  });

  /* 速度 */
  document.getElementById("speed").addEventListener("input", (e) => {
    speed = e.target.value / 100;
  });

  /* 回転の停止・再開 */
  const motionBtn = document.getElementById("motion-toggle");
  function syncMotionBtn() {
    motionBtn.setAttribute("aria-pressed", String(running));
    motionBtn.textContent = running ? "回転を止める" : "回転を動かす";
  }
  motionBtn.addEventListener("click", () => {
    running = !running;
    syncMotionBtn();
    if (!running) {
      drawSource(0);
      drawScope();
    }
  });
  syncMotionBtn();

  reduceMotion.addEventListener?.("change", () => {
    running = !reduceMotion.matches;
    syncMotionBtn();
  });

  /* ページが非表示のあいだは止める */
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
  });

  new ResizeObserver(fit).observe(canvas);
  buildParticles();
  fit();
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(frame);
  });

  /* ---------- 予約ダイアログ ---------- */

  const dialog = document.getElementById("reserve-dialog");
  const form = document.getElementById("reserve-form");
  const done = document.getElementById("reserve-done");
  const error = document.getElementById("form-error");
  const summary = document.getElementById("done-summary");

  document.querySelectorAll("[data-open-reserve]").forEach((b) =>
    b.addEventListener("click", () => {
      form.hidden = false;
      done.hidden = true;
      error.hidden = true;
      document.getElementById("r-chamber").value = chamber;
      dialog.showModal();
    }),
  );

  document.querySelectorAll("[data-close-reserve]").forEach((b) =>
    b.addEventListener("click", () => dialog.close()),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const mail = form.mail.value.trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const finish = form.finish.value === "black" ? "黒漆" : "真鍮・梨地";
    const chamberName = { glass: "硝子の欠片", hana: "乾いた花", konpeito: "金平糖" }[form.chamber.value];
    summary.textContent = `${name} 様：${finish} × ${chamberName} × ${form.count.value}本`;
    form.hidden = true;
    done.hidden = false;
    done.querySelector("button").focus();
  });
})();
