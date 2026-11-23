(() => {
  const rooms = {
    migiwa: { name: "汀", base: 29000 },
    nagi: { name: "凪", base: 26000 },
    iso: { name: "磯", base: 33000 },
  };
  const roomOrder = ["migiwa", "nagi", "iso"];
  const saturdaySurcharge = 5000;
  const solo = 8000;
  const span = 28;
  const dows = ["日", "月", "火", "水", "木", "金", "土"];
  const yen = (n) => `${n.toLocaleString("ja-JP")}円`;
  const kanjiCount = ["", "一", "二"];

  const scene = document.querySelector(".scene");
  const tideToggle = document.querySelector("[data-tide-toggle]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const syncReduce = () => {
    tideToggle.hidden = reduce.matches;
  };
  syncReduce();
  reduce.addEventListener("change", syncReduce);
  tideToggle.addEventListener("click", () => {
    const paused = scene.classList.toggle("paused");
    tideToggle.setAttribute("aria-pressed", String(paused));
    tideToggle.textContent = paused ? "波を動かす" : "波を止める";
  });

  const mapPoints = new Map(
    [...document.querySelectorAll(".map-pt[data-spot]")].map((el) => [el.dataset.spot, el]),
  );
  const spots = [...document.querySelectorAll(".spot")];
  let pinned = null;
  const light = (key) => {
    mapPoints.forEach((el, k) => el.classList.toggle("is-on", k === key || k === "inn"));
  };
  spots.forEach((btn) => {
    btn.setAttribute("aria-pressed", "false");
    const key = btn.dataset.spot;
    btn.addEventListener("mouseenter", () => light(key));
    btn.addEventListener("focus", () => light(key));
    btn.addEventListener("mouseleave", () => light(pinned));
    btn.addEventListener("blur", () => light(pinned));
    btn.addEventListener("click", () => {
      pinned = pinned === key ? null : key;
      spots.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.spot === pinned)));
      light(pinned);
    });
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: span + 2 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const serial = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const nightState = (room, d) => {
    if (d.getDay() === 3) return "closed";
    const h = (Math.imul(serial(d) * 3 + roomOrder.indexOf(room) + 7, 2654435761) >>> 0) % 100;
    return h < 30 ? "full" : "open";
  };
  const perPerson = (room, d) => rooms[room].base + (d.getDay() === 6 ? saturdaySurcharge : 0);
  const nightPrice = (room, d, guests) => {
    const per = perPerson(room, d);
    return guests === 1 ? per + solo : per * 2;
  };
  const nightTerm = (room, d, guests) => {
    const per = perPerson(room, d);
    return guests === 1 ? `${yen(per)} ＋ 一名利用 ${yen(solo)}` : `${yen(per)} × 2名`;
  };
  const breakdown = (room, stay, guests) => {
    const terms = stay.map((d) => nightTerm(room, d, guests));
    const wrap = (t) => (guests === 1 && terms.length > 1 ? `（${t}）` : t);
    if (terms.length > 1 && terms.every((t) => t === terms[0])) return `${wrap(terms[0])} × ${terms.length}泊`;
    return terms.map(wrap).join(" ＋ ");
  };
  const label = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${dows[d.getDay()]}）`;

  const form = document.getElementById("reserve-form");
  const cal = document.getElementById("cal");
  const quote = document.getElementById("quote");
  const result = document.getElementById("reserve-result");
  let chosen = null;

  const read = () => ({
    room: form.elements.room.value,
    nights: Number(form.elements.nights.value),
    guests: Number(form.elements.guests.value),
  });

  const stayFor = (start, nights) => days.slice(start, start + nights);

  const renderCal = () => {
    const { room, nights } = read();
    cal.replaceChildren();
    dows.forEach((w, i) => {
      const el = document.createElement("span");
      el.className = `cal-dow${i === 6 ? " sat" : ""}`;
      el.setAttribute("aria-hidden", "true");
      el.textContent = w;
      cal.append(el);
    });
    for (let i = 0; i < today.getDay(); i += 1) {
      const pad = document.createElement("span");
      pad.className = "cal-pad";
      pad.setAttribute("aria-hidden", "true");
      cal.append(pad);
    }
    const stay = chosen === null ? [] : stayFor(chosen, nights).map(serial);
    days.slice(0, span).forEach((d, i) => {
      const state = nightState(room, d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day";
      btn.dataset.state = state;
      btn.dataset.index = String(i);
      const showMonth = i === 0 || d.getDate() === 1;
      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = showMonth ? `${d.getMonth() + 1}/${d.getDate()}` : String(d.getDate());
      const mark = document.createElement("span");
      mark.className = "day-mark";
      mark.textContent = state === "open" ? "空" : state === "full" ? "満" : "休";
      btn.append(num, mark);
      const word = state === "open" ? "空きあり" : state === "full" ? "満室" : "休館日";
      btn.setAttribute("aria-label", `${label(d)} ${word}`);
      if (state !== "open") btn.disabled = true;
      btn.setAttribute("aria-pressed", String(chosen === i));
      if (stay.includes(serial(d)) && chosen !== i) btn.classList.add("in-stay");
      btn.addEventListener("click", () => {
        chosen = i;
        result.replaceChildren();
        renderCal();
        renderQuote();
        cal.querySelector(`[data-index="${i}"]`).focus();
      });
      cal.append(btn);
    });
  };

  const problem = () => {
    if (chosen === null) return "カレンダーから、チェックインの日を選んでください。";
    const { room, nights } = read();
    const blocked = stayFor(chosen, nights).find((d) => nightState(room, d) !== "open");
    if (blocked)
      return `${label(blocked)}の夜が${nightState(room, blocked) === "closed" ? "休館日" : "満室"}のため、この日からの${kanjiCount[nights]}泊はご案内できません。泊数か日にちを変えてみてください。`;
    return null;
  };

  const renderQuote = () => {
    quote.replaceChildren();
    const issue = problem();
    if (chosen === null) {
      const p = document.createElement("p");
      p.className = "quote-empty";
      p.textContent = issue;
      quote.append(p);
      return;
    }
    const { room, nights, guests } = read();
    const stay = stayFor(chosen, nights);
    const out = new Date(stay[stay.length - 1]);
    out.setDate(out.getDate() + 1);
    const dl = document.createElement("dl");
    const rows = [
      ["部屋", `${rooms[room].name}`],
      ["チェックイン", `${label(stay[0])} 15:00〜`],
      ["チェックアウト", `${label(out)} 〜11:00`],
      ["人数", `${kanjiCount[guests]}名・夕朝食つき`],
    ];
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    });
    quote.append(dl);
    if (issue) {
      const warn = document.createElement("p");
      warn.className = "quote-warn";
      warn.textContent = issue;
      quote.append(warn);
      return;
    }
    const total = stay.reduce((sum, d) => sum + nightPrice(room, d, guests), 0);
    const p = document.createElement("p");
    p.className = "quote-total";
    p.textContent = `合計 ${yen(total)}`;
    const detail = document.createElement("span");
    detail.className = "quote-breakdown";
    detail.textContent = breakdown(room, stay, guests);
    p.append(detail);
    const small = document.createElement("small");
    small.textContent = "架空の料金・税込";
    p.append(small);
    quote.append(p);
  };

  form.addEventListener("change", (e) => {
    if (e.target.name === "room" || e.target.name === "nights") renderCal();
    if (e.target.name) {
      result.replaceChildren();
      renderQuote();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    result.replaceChildren();
    const issue = problem();
    if (issue) {
      const p = document.createElement("p");
      p.className = "result-error";
      p.textContent = issue;
      result.append(p);
      result.focus();
      return;
    }
    const { room, nights, guests } = read();
    const stay = stayFor(chosen, nights);
    const total = stay.reduce((sum, d) => sum + nightPrice(room, d, guests), 0);
    const card = document.createElement("div");
    card.className = "result-card";
    const h = document.createElement("h3");
    h.textContent = "ご予約を承りました（デモ）";
    const p1 = document.createElement("p");
    p1.className = "result-code";
    p1.textContent = `${rooms[room].name}・${label(stay[0])}から${kanjiCount[nights]}泊・${kanjiCount[guests]}名・${yen(total)} ＝ ${breakdown(room, stay, guests)}`;
    const p2 = document.createElement("p");
    p2.textContent = "これはブラウザの中だけで動くデモです。予約は実際には作られておらず、内容はどこにも送信・保存していません。岸ねの宿は架空の宿です。";
    card.append(h, p1, p2);
    result.append(card);
    result.focus();
  });

  renderCal();
  renderQuote();

  const dialog = document.getElementById("inquiry");
  const inquiryForm = document.getElementById("inquiry-form");
  const inquiryResult = document.getElementById("inquiry-result");
  let opener = null;
  document.querySelectorAll("[data-open-inquiry]").forEach((btn) => {
    btn.addEventListener("click", () => {
      opener = btn;
      inquiryResult.replaceChildren();
      dialog.showModal();
      inquiryForm.elements.name.focus();
    });
  });
  document.querySelector("[data-close-inquiry]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (opener) opener.focus();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  inquiryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    inquiryResult.replaceChildren();
    const name = inquiryForm.elements.name.value.trim();
    const body = inquiryForm.elements.body.value.trim();
    const p = document.createElement("p");
    if (!name || !body) {
      p.textContent = "お名前と、聞きたいことを書いてください。";
      inquiryResult.append(p);
      (name ? inquiryForm.elements.body : inquiryForm.elements.name).focus();
      return;
    }
    p.textContent = `${name} さま、お問い合わせを承りました（デモ）。本物の宿なら、宿の者が一両日のうちにお返事する場面です。この内容はどこにも送信していません。`;
    inquiryResult.append(p);
    inquiryForm.reset();
  });
})();
