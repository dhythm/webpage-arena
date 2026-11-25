"use strict";

// 試し書き：キャンバスの上に線を引くデモ
const pad = document.getElementById("pad");
const ctx = pad.getContext("2d");
let nibWidth = 3.5;
let inkColor = "#26221f";
let drawing = false;
let last = null;

function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = pad.getBoundingClientRect();
  const snapshot = drawing || last ? pad.toDataURL() : null;
  pad.width = Math.round(rect.width * ratio);
  pad.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (snapshot) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = snapshot;
  }
}
fitCanvas();
window.addEventListener("resize", fitCanvas);

function pointOf(event) {
  const rect = pad.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
pad.addEventListener("pointerdown", (event) => {
  drawing = true;
  last = pointOf(event);
  try { pad.setPointerCapture(event.pointerId); } catch { /* キャプチャできなくても描画は続ける */ }
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = nibWidth;
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(last.x + 0.1, last.y + 0.1);
  ctx.stroke();
});
pad.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  const p = pointOf(event);
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = nibWidth;
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
});
const stop = () => { drawing = false; };
pad.addEventListener("pointerup", stop);
pad.addEventListener("pointercancel", stop);

function segWire(selector, attr, apply) {
  const buttons = [...document.querySelectorAll(selector)];
  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      for (const b of buttons) { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); }
      btn.classList.add("is-on");
      btn.setAttribute("aria-pressed", "true");
      apply(btn.dataset[attr]);
    });
  }
}
segWire("[data-nib]", "nib", (v) => { nibWidth = Number.parseFloat(v); });
segWire("[data-ink]", "ink", (v) => { inkColor = v; });

document.getElementById("draw-clear").addEventListener("click", () => {
  const rect = pad.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  last = null;
});

// 価格ビルダー
const BASE = 24000;
const PRICES = { "opt-engrave": 1200, "opt-box": 800, "opt-ink": 1500 };
const totalOut = document.getElementById("total");
function recalc() {
  let total = BASE;
  for (const [id, price] of Object.entries(PRICES)) {
    if (document.getElementById(id).checked) total += price;
  }
  totalOut.textContent = `¥${total.toLocaleString("ja-JP")}`;
}
for (const id of Object.keys(PRICES)) document.getElementById(id).addEventListener("change", recalc);
recalc();

document.getElementById("buy").addEventListener("click", () => {
  document.getElementById("buy-note").textContent =
    "これはデモです。購入手続きは始まらず、入力や支払いは行われません。";
});
