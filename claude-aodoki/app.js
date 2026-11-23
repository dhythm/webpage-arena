import { dateOptions, dayLabel, minuteOf, parseNow, sameDay, slotsFor, statusText, toMin } from "./hours.js";

(() => {
  const root = document.documentElement;
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

  let injected = parseNow(window.__AODOKI_NOW);
  const now = () => (injected ? new Date(injected.getTime()) : new Date());

  const nowEl = document.querySelector(".now");
  const nowText = document.getElementById("now-text");
  const skyNow = document.getElementById("sky-now");
  const tellTime = () => {
    const t = now();
    const { text, open } = statusText(t);
    nowText.textContent = text;
    nowEl.classList.toggle("is-open", open);
    const h = minuteOf(t) / 60;
    const inRange = h >= 16 && h < 24;
    skyNow.classList.toggle("is-shown", inRange);
    if (inRange) skyNow.style.left = `${((h - 16) / 8) * 100}%`;
  };

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
  const slotBox = document.getElementById("r-slots");
  const caps = { counter: 6, window: 2, koagari: 4 };
  const seatNames = { counter: "カウンター", window: "窓際の二人席", koagari: "小上がり" };
  const peopleNames = { 1: "ひとり", 2: "ふたり", 3: "三人", 4: "四人" };
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

  const dates = new Map();
  const buildDates = () => {
    const keep = dateSel.value;
    dates.clear();
    dateSel.querySelectorAll("option[value]:not([value=''])").forEach((o) => o.remove());
    for (const { key, date, label } of dateOptions(now(), 10)) {
      dates.set(key, date);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = label;
      dateSel.append(opt);
    }
    dateSel.value = dates.has(keep) ? keep : "";
  };

  const selected = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value ?? "";

  const buildSlots = () => {
    const key = dateSel.value;
    const d = dates.get(key);
    const keep = selected("time");
    slotBox.replaceChildren();
    if (!d) {
      const empty = document.createElement("p");
      empty.className = "slots-empty";
      empty.textContent = "日にちを選ぶと、その日の時刻が出ます。";
      slotBox.append(empty);
      return;
    }
    const t = now();
    const nowM = sameDay(d, t) ? minuteOf(t) : -Infinity;
    let first = true;
    for (const group of slotsFor(d)) {
      const wrap = document.createElement("div");
      wrap.className = "slot-group";
      const name = document.createElement("p");
      name.className = "slot-name";
      name.textContent = group.name;
      const list = document.createElement("div");
      list.className = "slot-list";
      for (const time of group.times) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "time";
        input.value = time;
        if (first) input.required = true;
        first = false;
        input.disabled = toMin(time) < nowM + 30 || Object.keys(caps).every((seat) => left(key, time, seat) === 0);
        input.checked = !input.disabled && time === keep;
        const span = document.createElement("span");
        span.textContent = time;
        label.append(input, span);
        list.append(label);
      }
      wrap.append(name, list);
      slotBox.append(wrap);
    }
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
    refreshAvail();
    error.textContent = "";
  };
  form.addEventListener("change", (event) => {
    if (event.target === dateSel) buildSlots();
    refresh();
  });

  const renderAll = () => {
    tellTime();
    buildDates();
    buildSlots();
    refresh();
  };
  renderAll();
  setInterval(tellTime, 30000);
  window.Aodoki = {
    setNow(value) {
      injected = parseNow(value);
      renderAll();
    },
    now,
  };

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
