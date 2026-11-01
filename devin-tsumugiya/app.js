/* つむぎや — 機（はた）の帯と織見本
   hero の帯はよこ糸を一段ずつ打ち込んで縞を育てる。
   見本帳では選んだよこ糸でオリジナルの縞を織り、品番を振る。 */

(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const INK = "#1d2a38";
  const SARASHI = "#f5f3ec";
  const WARP = "#e8e2d2"; // たて糸（晒）
  const WARP_LINE = "rgba(29,42,56,0.10)";

  /* ========== 機（はた）の帯 ========== */

  const loom = document.getElementById("loom");
  const lctx = loom.getContext("2d");

  /* 品番 TY-0246「遠縞」のよこ糸順： [色, 段数] */
  const TOOSHIMA = [
    [INK, 5], ["#a5402d", 1], [WARP, 1],
    [INK, 2], ["#b8902f", 1],
    [INK, 4], ["#5f8977", 1], [WARP, 1], [INK, 1],
  ];
  const pattern = TOOSHIMA.flatMap(([c, n]) => Array(n).fill(c));

  const ROW_H = 11;
  let W = 0, H = 120;
  let rows = [];
  let rowIndex = 0;
  let progress = 0; // 現在のよこ糸の打ち込み位置（0..W）
  let weaving = !reduceMotion.matches;

  function loomFit() {
    const cssW = loom.clientWidth;
    const cssH = 120;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.round(cssW * dpr);
    H = Math.round(cssH * dpr);
    loom.width = W;
    loom.height = H;
    drawLoom();
  }

  function rowColor(i) {
    return pattern[((i % pattern.length) + pattern.length) % pattern.length];
  }

  function drawRow(i, top, widthPx) {
    const rh = ROW_H * (W / loom.clientWidth || 1);
    lctx.fillStyle = rowColor(i);
    lctx.fillRect(0, top, widthPx, rh - 1);
    /* 縦糸の筋 */
    lctx.fillStyle = WARP_LINE;
    for (let x = 1; x < widthPx; x += 3) {
      lctx.fillRect(x, top, 1, rh - 1);
    }
  }

  function drawLoom() {
    const scale = W / loom.clientWidth || 1;
    const rh = ROW_H * scale;
    lctx.fillStyle = WARP;
    lctx.fillRect(0, 0, W, H);
    /* まだ織られていない上部のたて糸を濃く見せる */
    lctx.fillStyle = WARP_LINE;
    for (let x = 1; x < W; x += 3) lctx.fillRect(x, 0, 1, H);

    const visible = Math.ceil(H / rh);
    /* rows[0] が最上段。現在打ち込み中の段が最下段 */
    for (let i = 0; i < Math.min(rows.length, visible); i++) {
      const top = H - (rows.length - i) * rh;
      if (i === rows.length - 1 && weaving) {
        drawRow(i, top, progress);
        /* 梭（シャトル） */
        lctx.fillStyle = "#efe9da";
        lctx.fillRect(progress - 6 * scale, top + 1, 12 * scale, rh - 3);
        lctx.strokeStyle = INK;
        lctx.lineWidth = Math.max(1, scale);
        lctx.strokeRect(progress - 6 * scale, top + 1, 12 * scale, rh - 3);
      } else {
        drawRow(i, top, W);
      }
    }
  }

  let loomLast = 0;
  function loomFrame(now) {
    if (weaving && W > 0) {
      const dt = Math.min(now - loomLast, 100);
      loomLast = now;
      progress += (dt / 900) * W; /* 一段 ≒ 0.9秒 */
      if (progress >= W) {
        progress = 0;
        rows.push(rowIndex++);
        const scale = W / loom.clientWidth || 1;
        const rh = ROW_H * scale;
        while (rows.length > Math.ceil(H / rh) + 1) rows.shift();
      }
      drawLoom();
    }
    requestAnimationFrame(loomFrame);
  }

  /* 初期：織り上がった状態か、織り途中か */
  function seedLoom(full) {
    const scale = W / (loom.clientWidth || W) || 1;
    const rh = ROW_H * scale;
    const visible = Math.ceil(H / rh) + 1;
    if (full) {
      rows = Array.from({ length: visible }, (_, i) => i);
      rowIndex = visible;
    } else {
      /* 帯はほぼ織り上がり、最下段の途中から */
      rows = Array.from({ length: visible }, (_, i) => i);
      rowIndex = visible;
      progress = W * 0.3;
    }
    drawLoom();
  }

  const loomBtn = document.getElementById("loom-toggle");
  function syncLoomBtn() {
    loomBtn.setAttribute("aria-pressed", String(weaving));
    loomBtn.textContent = weaving ? "織るのを止める" : "織りを動かす";
  }
  loomBtn.addEventListener("click", () => {
    weaving = !weaving;
    syncLoomBtn();
    if (weaving) seedLoom(false);
    else seedLoom(true);
  });
  syncLoomBtn();

  reduceMotion.addEventListener?.("change", () => {
    weaving = !reduceMotion.matches;
    syncLoomBtn();
    seedLoom(!weaving);
  });

  new ResizeObserver(loomFit).observe(loom);
  loomFit();
  seedLoom(!weaving);
  requestAnimationFrame((t) => {
    loomLast = t;
    requestAnimationFrame(loomFrame);
  });

  /* ========== 織見本：よこ糸を選ぶ ========== */

  const YARNS = [
    ["ai", "藍", "#2e4668"],
    ["akane", "茜", "#a5402d"],
    ["karashi", "からし", "#b8902f"],
    ["asagi", "浅葱", "#5f8977"],
    ["sakura", "桜", "#d9a0a8"],
    ["sumi", "墨", "#332f28"],
    ["hagare", "茄子紺", "#7a5f74"],
  ];

  const ctl = document.getElementById("weaver-ctl");
  const swatch = document.getElementById("swatch");
  const wctx = swatch.getContext("2d");
  const hinban = document.getElementById("hinban");

  /* 糸チップを生成（二・三番には「なし」） */
  const defaults = ["ai", "akane", "karashi"];
  document.querySelectorAll(".chips").forEach((box) => {
    const slot = Number(box.dataset.slot);
    const opts = slot === 0 ? YARNS : [["none", "なし", null], ...YARNS];
    for (const [key, label, color] of opts) {
      const chip = document.createElement("label");
      chip.className = "chip" + (key === "none" ? " none" : "");
      chip.style.setProperty("--c", color || "transparent");
      chip.innerHTML =
        `<input type="radio" name="w${slot}" value="${key}">` +
        `<span>${label}</span>`;
      if (defaults[slot] === key) chip.querySelector("input").checked = true;
      box.appendChild(chip);
    }
  });

  function chosen() {
    const picks = [0, 1, 2].map((i) => {
      const el = ctl.querySelector(`input[name="w${i}"]:checked`);
      return el ? el.value : "none";
    });
    const rhythm = ctl.querySelector('input[name="rhythm"]:checked').value;
    return { picks, rhythm };
  }

  function yarnColor(key) {
    const y = YARNS.find(([k]) => k === key);
    return y ? y[2] : null;
  }

  function weave() {
    const { picks, rhythm } = chosen();
    const colors = picks.map(yarnColor).filter(Boolean);
    const w = swatch.width, h = swatch.height;
    const u = w / 640; /* 密度係数 */

    wctx.fillStyle = WARP;
    wctx.fillRect(0, 0, w, h);

    /* 縞の並びを計算 */
    const seq = [];
    if (colors.length === 0) {
      /* よこ糸なし：晒そのまま */
    } else if (rhythm === "even") {
      let i = 0;
      while (seq.reduce((s, r) => s + r[1], 0) < h + 40 * u) {
        seq.push([colors[i % colors.length], 14 * u]);
        i++;
      }
    } else {
      /* 遠縞：本縞→細縞→地→跳ね の繰り返し */
      const [a, b, c] = [colors[0], colors[1] || WARP, colors[2] || colors[0]];
      const unit = [
        [a, 26 * u], [b, 4 * u], [WARP, 3 * u],
        [a, 8 * u], [c, 3 * u],
        [a, 16 * u], [WARP, 5 * u], [c, 2 * u],
      ];
      let i = 0;
      while (seq.reduce((s, r) => s + r[1], 0) < h + 40 * u) {
        seq.push(unit[i % unit.length]);
        i++;
      }
    }

    let y = 0;
    for (const [color, rh] of seq) {
      wctx.fillStyle = color;
      wctx.fillRect(0, y, w, rh);
      y += rh;
      if (y > h) break;
    }

    /* 織り目：縦糸の筋とよこ糸の節 */
    wctx.fillStyle = WARP_LINE;
    for (let x = 1; x < w; x += 3 * u) wctx.fillRect(x, 0, Math.max(1, u), h);
    wctx.fillStyle = "rgba(29,42,56,0.06)";
    for (let yy = 0; yy < h; yy += 4 * u) wctx.fillRect(0, yy, w, Math.max(1, u * 0.6));

    /* 耳（セルビッジ） */
    wctx.fillStyle = "rgba(29,42,56,0.16)";
    wctx.fillRect(0, 0, 8 * u, h);
    wctx.fillRect(w - 8 * u, 0, 8 * u, h);

    /* 品番を振る */
    const idx = picks.map((p) => (p === "none" ? 0 : YARNS.findIndex(([k]) => k === p) + 1));
    const num = (idx[0] * 343 + idx[1] * 49 + idx[2] * 7 + (rhythm === "tooshima" ? 3 : 0)) % 9000 + 1;
    hinban.textContent = "TY-" + String(num).padStart(4, "0");
  }

  ctl.addEventListener("change", weave);
  weave();

  /* ========== 相談ダイアログ ========== */

  const dialog = document.getElementById("contact-dialog");
  const form = document.getElementById("contact-form");
  const done = document.getElementById("contact-done");
  const error = document.getElementById("c-error");
  const summary = document.getElementById("contact-summary");

  document.querySelectorAll("[data-open-contact]").forEach((b) =>
    b.addEventListener("click", () => {
      form.hidden = false;
      done.hidden = true;
      error.hidden = true;
      dialog.showModal();
    }),
  );

  document.querySelectorAll("[data-close-contact]").forEach((b) =>
    b.addEventListener("click", () => dialog.close()),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const mail = form.mail.value.trim();
    const body = form.body.value.trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || !body) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    summary.textContent = `${form.type.value}：${name} 様「${body.slice(0, 40)}${body.length > 40 ? "…" : ""}」`;
    form.hidden = true;
    done.hidden = false;
    done.querySelector("button").focus();
  });
})();
