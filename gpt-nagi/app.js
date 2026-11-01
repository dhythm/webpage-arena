const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", open);
  menuButton.setAttribute(
    "aria-label",
    open ? "メニューを閉じる" : "メニューを開く",
  );
  mobileNav.hidden = !open;
});
mobileNav.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    mobileNav.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "メニューを開く");
  }),
);
const dialog = document.querySelector(".reserve-dialog");
dialog.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const items = [
    ...dialog.querySelectorAll(
      'button, input, a[href], select, textarea, [tabindex="0"]',
    ),
  ].filter((el) => !el.disabled && el.getClientRects().length);
  const first = items[0],
    last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
const form = dialog.querySelector("form");
const success = dialog.querySelector(".form-success");
document.querySelectorAll("[data-reserve]").forEach((button) =>
  button.addEventListener("click", () => {
    form.hidden = false;
    success.hidden = true;
    form.reset();
    dialog.showModal();
  }),
);
dialog
  .querySelector(".dialog-close")
  .addEventListener("click", () => dialog.close());
success.querySelector("button").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  form.hidden = true;
  success.hidden = false;
  success.querySelector("button").focus();
});
const colors = { sand: "Sand White", clay: "Clay Beige", charcoal: "Charcoal" };
const japaneseColors = {
  sand: "サンドホワイト",
  clay: "クレイベージュ",
  charcoal: "チャコール",
};
document.querySelectorAll(".swatch").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach((item) => {
      item.classList.toggle("selected", item === button);
      item.setAttribute("aria-pressed", item === button);
    });
    const color = button.dataset.color;
    const visual = document.querySelector(".product-visual");
    visual.dataset.color = color;
    visual.querySelector("img").alt =
      `${japaneseColors[color]}のNAGIスピーカー（色調イメージ）`;
    document.querySelector("#color-name").textContent = colors[color];
  }),
);
const wave = document.querySelector(".waveform");
for (let i = 0; i < 110; i++) {
  const bar = document.createElement("span");
  const envelope = 0.2 + Math.sin((i / 109) * Math.PI) * 0.8;
  bar.style.setProperty(
    "--h",
    `${(17 + Math.abs(Math.sin(i * 2.3) * Math.cos(i * 0.33)) * 88) * envelope}px`,
  );
  bar.style.setProperty("--d", `${0.6 + (i % 13) * 0.11}s`);
  bar.style.animationDelay = `${-(i % 17) * 0.12}s`;
  wave.append(bar);
}
let audio,
  gain,
  filter,
  source,
  tone,
  playing = false,
  scene = "morning";
const tracks = {
  morning: { title: "朝の余白", frequency: 750, q: 0.35, tone: 220 },
  rain: { title: "雨の日の読書", frequency: 2800, q: 0.2, tone: 164.81 },
  night: { title: "夜の静けさ", frequency: 380, q: 0.7, tone: 130.81 },
};
const playButton = document.querySelector(".play-button");
const status = document.querySelector("#audio-status");
const volume = document.querySelector("input[type=range]");
async function createAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error("Audio unavailable");
  audio = new Context();
  gain = audio.createGain();
  gain.gain.value = 0;
  gain.connect(audio.destination);
  filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.connect(gain);
  const buffer = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < data.length; i++) {
    previous = (previous + (Math.random() * 2 - 1) * 0.03) / 1.03;
    data[i] = previous * 3;
  }
  source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(filter);
  source.start();
  tone = audio.createOscillator();
  tone.type = "sine";
  const toneGain = audio.createGain();
  toneGain.gain.value = 0.015;
  tone.connect(toneGain);
  toneGain.connect(gain);
  tone.start();
  applyScene();
}
function applyScene() {
  if (!audio) return;
  const track = tracks[scene];
  filter.frequency.setTargetAtTime(track.frequency, audio.currentTime, 0.5);
  filter.Q.setTargetAtTime(track.q, audio.currentTime, 0.5);
  tone.frequency.setTargetAtTime(track.tone, audio.currentTime, 0.5);
}
function stopAudio() {
  playing = false;
  if (gain)
    (gain.gain.cancelScheduledValues(audio.currentTime),
      gain.gain.setTargetAtTime(0, audio.currentTime, 0.12));
  document.querySelector(".sound-player").classList.remove("is-playing");
  playButton.setAttribute("aria-pressed", "false");
  playButton.setAttribute("aria-label", "環境音を再生");
  playButton.querySelector("span").textContent = "▶";
  status.textContent = "再生して、ひと息。";
}
playButton.addEventListener("click", async () => {
  if (playing) {
    stopAudio();
    return;
  }
  try {
    if (!audio) await createAudio();
    await audio.resume();
    playing = true;
    gain.gain.setTargetAtTime(
      (Number(volume.value) / 100) * 0.55,
      audio.currentTime,
      0.3,
    );
    document.querySelector(".sound-player").classList.add("is-playing");
    playButton.setAttribute("aria-pressed", "true");
    playButton.setAttribute("aria-label", "環境音を一時停止");
    playButton.querySelector("span").textContent = "Ⅱ";
    status.textContent = "環境音を再生しています。";
  } catch {
    status.textContent = "このブラウザでは音を再生できません。";
  }
});
document.querySelectorAll(".scene").forEach((button) =>
  button.addEventListener("click", () => {
    scene = button.dataset.scene;
    document.querySelectorAll(".scene").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", item === button);
    });
    document.querySelector("#track-name").textContent = tracks[scene].title;
    applyScene();
  }),
);
volume.addEventListener("input", () => {
  if (gain && playing)
    gain.gain.setTargetAtTime(
      (Number(volume.value) / 100) * 0.55,
      audio.currentTime,
      0.1,
    );
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) stopAudio();
});
window.addEventListener("pagehide", stopAudio);
