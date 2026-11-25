// 潮待ち：潮位の目安計算と料金デモ（すべてブラウザの中で完結する架空の計算です）

// ---- 潮位の目安 ----
// 基準：2026年1月1日の満潮を 05:12 とし、潮の周期を約12時間25分として
// 日付から機械的にずらした「目安」を出す。実際の潮位とは関係ない。
const TIDE_BASE = Date.UTC(2026, 0, 1, 5, 12); // 基準の満潮（UTCミリ秒）
const TIDE_CYCLE_MS = (12 * 60 + 25) * 60 * 1000; // 満潮から次の満潮まで
const DAY_MS = 24 * 60 * 60 * 1000;

function tideEventsFor(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = Date.UTC(y, m - 1, d, 0, 0);
  // その日の0時より前で一番近い満潮から数え、当日分を拾う
  const cycles = Math.floor((dayStart - TIDE_BASE) / TIDE_CYCLE_MS);
  const events = [];
  for (let i = cycles - 1; i < cycles + 4; i++) {
    const high = TIDE_BASE + i * TIDE_CYCLE_MS;
    const low = high + TIDE_CYCLE_MS / 2;
    for (const [time, kind] of [[high, "満潮"], [low, "干潮"]]) {
      if (time >= dayStart && time < dayStart + DAY_MS) {
        events.push({ time, kind });
      }
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

function fmtTime(ms) {
  const t = new Date(ms);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function renderTide() {
  const input = document.getElementById("tide-date");
  const out = document.getElementById("tide-result");
  if (!input || !out || !input.value) return;
  const events = tideEventsFor(input.value);
  if (!events.length) {
    out.textContent = "この日の潮位は計算できませんでした。";
    return;
  }
  const rows = events.map((e) => {
    const cls = e.kind === "満潮" ? "mark-high" : "mark-low";
    const ferry = e.kind === "満潮" ? "船の出入りができる目安の中心" : "干潟歩きの目安の中心";
    return `<tr><th scope="row" class="${cls}">${e.kind}</th><td>${fmtTime(e.time)}</td><td>${ferry}</td></tr>`;
  }).join("");
  const highs = events.filter((e) => e.kind === "満潮").map((e) => fmtTime(e.time)).join(" と ");
  out.innerHTML = `<table><tbody>${rows}</tbody></table>` +
    `<p class="tide-ferry">船は満潮（${highs}）のおおむね1時間前から1時間後まで港に入れます。到着日が決まったら、この満潮に合わせて深浦を出てください。</p>`;
}

const tideDate = document.getElementById("tide-date");
if (tideDate) {
  tideDate.addEventListener("change", renderTide);
  renderTide();
}

// ---- 料金と予約デモ ----
const PRICE = { base: 38000, baseGuests: 4, extraGuest: 6000, dinner: 4500, breakfast: 1800 };

function calcTotal() {
  const nights = Number(document.getElementById("bk-nights").value);
  const guests = Number(document.getElementById("bk-guests").value);
  const dinner = document.getElementById("bk-dinner").checked;
  const breakfast = document.getElementById("bk-breakfast").checked;
  const extra = Math.max(0, guests - PRICE.baseGuests);
  let total = (PRICE.base + extra * PRICE.extraGuest) * nights;
  if (dinner) total += PRICE.dinner * guests * nights;
  if (breakfast) total += PRICE.breakfast * guests * nights;
  return { nights, guests, dinner, breakfast, total };
}

function renderTotal() {
  const el = document.getElementById("bk-total");
  if (el) el.textContent = "¥" + calcTotal().total.toLocaleString("ja-JP");
}

const bookingForm = document.getElementById("booking-demo");
if (bookingForm) {
  bookingForm.addEventListener("change", renderTotal);
  bookingForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { nights, guests, dinner, breakfast, total } = calcTotal();
    const meals = [dinner ? "夕食あり" : "夕食なし", breakfast ? "朝食あり" : "朝食なし"].join("・");
    document.getElementById("bk-output").textContent =
      `予約メモ（デモ）：${nights}泊／${guests}名／${meals}／合計 ¥${total.toLocaleString("ja-JP")}\n` +
      "これは画面の中だけのメモです。送信も決済もしていません。実際の宿は存在しません。";
  });
  renderTotal();
}
