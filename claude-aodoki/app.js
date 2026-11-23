(() => {
  const root = document.documentElement;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const stops = [
    [0, [58, 86, 128]],
    [0.45, [36, 57, 95]],
    [1, [16, 26, 46]],
  ];
  const mix = (t) => {
    for (let i = 1; i < stops.length; i++) {
      const [t1, c1] = stops[i];
      const [t0, c0] = stops[i - 1];
      if (t <= t1) {
        const k = (t - t0) / (t1 - t0);
        return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      }
    }
    return stops[stops.length - 1][1];
  };
  let ticking = false;
  const paint = () => {
    ticking = false;
    const max = Math.max(1, root.scrollHeight - innerHeight);
    const t = Math.min(1, Math.max(0, scrollY / max));
    const [r, g, b] = mix(t);
    root.style.setProperty("--sky", `rgb(${r} ${g} ${b})`);
    root.style.setProperty("--night", (0.2 + t * 0.8).toFixed(3));
  };
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paint);
      }
    },
    { passive: true },
  );
  addEventListener("resize", paint);
  paint();

  const pad = (n) => String(n).padStart(2, "0");
  const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const isClosedDay = (d) => d.getDay() === 1 || (d.getDay() === 2 && d.getDate() >= 15 && d.getDate() <= 21);
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const sessions = (d) => {
    if (isClosedDay(d)) return [];
    if (isWeekend(d))
      return [
        { open: 690, close: 840, last: 810 },
        { open: 1020, close: 1290, last: 1260 },
      ];
    return [{ open: 1050, close: 1350, last: 1320 }];
  };
  const dayLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
  const nextOpening = (from) => {
    for (let i = 1; i <= 14; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      const s = sessions(d);
      if (s.length) return `${i === 1 ? "明日" : `${days[d.getDay()]}曜`}の ${hm(s[0].open)}`;
    }
    return "";
  };

  const nowEl = document.querySelector(".now");
  const nowText = document.getElementById("now-text");
  const skyNow = document.getElementById("sky-now");
  const tellTime = () => {
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    const s = sessions(now);
    const current = s.find((x) => m >= x.open && m < x.close);
    const later = s.find((x) => m < x.open);
    let text;
    if (!s.length) text = `今日（${days[now.getDay()]}曜）はお休みです。次は${nextOpening(now)}から。`;
    else if (current) text = `いま ${hm(m)}。のれん、出ています。最後の注文は ${hm(current.last)} です。`;
    else if (later) text = `いま ${hm(m)}。今日は ${hm(later.open)} にのれんを出します。`;
    else text = `いま ${hm(m)}。今日はもう閉めました。次は${nextOpening(now)}から。`;
    nowText.textContent = text;
    nowEl.classList.toggle("is-open", Boolean(current));
    const h = now.getHours() + now.getMinutes() / 60;
    const inRange = h >= 16 && h < 24;
    skyNow.classList.toggle("is-shown", inRange);
    if (inRange) skyNow.style.left = `${((h - 16) / 8) * 100}%`;
  };
  tellTime();
  setInterval(tellTime, 30000);

  const plan = document.querySelector(".plan");
  const kinds = document.querySelectorAll(".seat-kind");
  const focusArea = (area) => {
    if (area) plan.dataset.focus = area;
    else delete plan.dataset.focus;
    kinds.forEach((k) => k.classList.toggle("is-on", k.dataset.area === area));
  };
  kinds.forEach((k) => {
    k.addEventListener("mouseenter", () => focusArea(k.dataset.area));
    k.addEventListener("focus", () => focusArea(k.dataset.area));
    k.addEventListener("mouseleave", () => focusArea(null));
    k.addEventListener("blur", () => focusArea(null));
  });
  plan.querySelectorAll(".plan-area").forEach((a) => {
    a.addEventListener("mouseenter", () => focusArea(a.dataset.area));
    a.addEventListener("mouseleave", () => focusArea(null));
  });

  const route = document.querySelector(".route");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => route.classList.toggle("is-drawn", e.isIntersecting));
    }).observe(route);
  }

  const form = document.getElementById("reserve-form");
  const dateSel = document.getElementById("r-date");
  const peopleSel = document.getElementById("r-people");
  const avail = document.getElementById("r-avail");
  const error = document.getElementById("r-error");
  const slotInputs = [...form.querySelectorAll('input[name="time"]')];
  const caps = { counter: 6, window: 2, koagari: 4 };
  const seatNames = { counter: "カウンター", window: "窓際の二人席", koagari: "小上がり" };
  const peopleNames = { 1: "ひとり", 2: "ふたり", 3: "三人", 4: "四人" };
  const toMin = (t) => {
    const [h, mi] = t.split(":").map(Number);
    return h * 60 + mi;
  };
  const hash = (str) => {
    let h = 2166136261;
    for (const ch of str) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const left = (date, time, seat) => {
    const cap = caps[seat];
    const n = hash(`${date}|${time}|${seat}`) % (cap + 2);
    return Math.min(cap, n);
  };

  const today = new Date();
  const dates = new Map();
  for (let i = 0; dates.size < 10 && i < 21; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (!sessions(d).length) continue;
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    dates.set(key, d);
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${dayLabel(d)}${i === 0 ? "　今夜" : ""}`;
    dateSel.append(opt);
  }

  const isToday = (d) => d.toDateString() === today.toDateString();
  const selected = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value ?? "";

  const refreshSlots = () => {
    const key = dateSel.value;
    const d = dates.get(key);
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    slotInputs.forEach((input) => {
      let off = false;
      if (d) {
        const m = toMin(input.value);
        const evening = sessions(d).find((s) => s.open >= 1000);
        if (!evening || m < evening.open || m > evening.last) off = true;
        if (isToday(d) && m < nowM + 30) off = true;
        if (Object.keys(caps).every((seat) => left(key, input.value, seat) === 0)) off = true;
      }
      input.disabled = off;
      if (off && input.checked) input.checked = false;
    });
  };

  const refreshAvail = () => {
    const key = dateSel.value;
    const time = selected("time");
    if (!key || !time) {
      avail.textContent = "日にちと時刻を選ぶと、残りの席数（仮）が出ます。";
      return;
    }
    const parts = Object.keys(caps).map((seat) => `${seatNames[seat]} ${left(key, time, seat)}`);
    avail.textContent = `${dayLabel(dates.get(key))} ${time} の残り（仮）：${parts.join("・")}`;
  };

  const refresh = () => {
    refreshSlots();
    refreshAvail();
    error.textContent = "";
  };
  form.addEventListener("change", refresh);
  refresh();

  const ticket = document.getElementById("ticket");
  ticket.addEventListener("animationend", (e) => {
    if (e.animationName === "punch") ticket.classList.add("is-done");
  });
  const fill = (id, value) => {
    document.getElementById(id).textContent = value;
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = dateSel.value;
    const time = selected("time");
    const seat = selected("seat");
    const people = Number(peopleSel.value);
    let problem = "";
    if (!key) problem = "日にちを選んでください。";
    else if (!time) problem = "時刻を選んでください。";
    else if (people > caps[seat]) problem = `${seatNames[seat]}は${peopleNames[caps[seat]]}までです。ほかの席を選んでください。`;
    else if (seat === "koagari" && people < 2) problem = "小上がりはふたりからご案内しています。";
    else if (left(key, time, seat) < people) {
      const others = Object.keys(caps).filter((s) => s !== seat && caps[s] >= people && left(key, time, s) >= people);
      problem = `その時刻の${seatNames[seat]}は空きが足りません（仮）。${others.length ? `${others.map((s) => seatNames[s]).join("か")}なら空いています。` : "ほかの時刻をお試しください。"}`;
    }
    if (problem) {
      error.textContent = problem;
      return;
    }
    error.textContent = "";
    fill("t-date", dayLabel(dates.get(key)));
    fill("t-time", time);
    fill("t-people", peopleNames[people]);
    fill("t-seat", seatNames[seat]);
    fill("t-name", form.elements.name.value.trim() || "—");
    ticket.hidden = false;
    ticket.classList.remove("is-new", "is-done");
    void ticket.offsetWidth;
    ticket.classList.add("is-new");
    ticket.focus({ preventScroll: true });
    if (innerWidth <= 900) ticket.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
})();
