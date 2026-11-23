(() => {
  const map = document.getElementById("nightmap");
  const hour = document.getElementById("hour");
  const out = document.getElementById("hour-out");
  const note = document.getElementById("hour-note");
  const people = [...map.querySelectorAll(".people circle")];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const label = (t) => {
    const h = Math.floor(t) % 24;
    const m = t % 1 ? "30" : "00";
    return `${h}:${m}`;
  };

  const describe = (shop, crowd) => {
    const light = shop > 0.66 ? "店の灯りあり" : shop > 0 ? "店が閉まりはじめる" : "店の灯りはほぼ消え、街灯だけ";
    const walk = crowd > 0.7 ? "人通りは多め" : crowd > 0.4 ? "人通りはやや多い" : crowd > 0.2 ? "人通りは少なめ" : "人通りはわずか";
    return `${light}。${walk}。`;
  };

  const update = () => {
    const t = Number(hour.value);
    const shop = clamp((23 - t) / 2, 0, 1);
    const crowd = clamp((25.5 - t) / 5.5, 0.08, 1);
    map.style.setProperty("--shop", shop.toFixed(2));
    const keep = Math.round(people.length * crowd);
    people.forEach((dot, i) => dot.classList.toggle("gone", i >= keep));
    const text = label(t);
    out.value = text;
    out.textContent = text;
    hour.setAttribute("aria-valuetext", text);
    note.textContent = describe(shop, crowd);
  };
  hour.addEventListener("input", update);
  update();

  const route = document.getElementById("route");
  const walker = document.getElementById("walker");
  const toggle = document.getElementById("walk-toggle");
  const length = route.getTotalLength();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const duration = 14000;
  let progress = 0;
  let last = 0;
  let frame = 0;
  let running = false;

  const place = () => {
    const p = route.getPointAtLength(progress * length);
    walker.setAttribute("cx", p.x.toFixed(1));
    walker.setAttribute("cy", p.y.toFixed(1));
  };

  const step = (now) => {
    if (last) progress = (progress + (now - last) / duration) % 1;
    last = now;
    place();
    frame = requestAnimationFrame(step);
  };

  const setRunning = (on) => {
    running = on;
    cancelAnimationFrame(frame);
    last = 0;
    if (on) frame = requestAnimationFrame(step);
    toggle.setAttribute("aria-pressed", String(on));
    toggle.textContent = on ? "歩く点を止める" : "歩く点を動かす";
  };

  toggle.addEventListener("click", () => setRunning(!running));
  reduce.addEventListener("change", (e) => {
    if (e.matches) setRunning(false);
  });
  progress = 0.42;
  place();
  setRunning(!reduce.matches);

  const button = document.getElementById("download-demo");
  const result = document.getElementById("download-result");
  button.addEventListener("click", () => {
    const os = document.querySelector('input[name="os"]:checked').value;
    const p = document.createElement("p");
    p.textContent = `${os} 版のダウンロード……の、デモでした。のまみちは架空のアプリなので、ファイルは届かず、どのストアにも移動しません。ここで終わりです。`;
    result.replaceChildren(p);
  });
})();
