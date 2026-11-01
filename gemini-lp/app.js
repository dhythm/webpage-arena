// AMENE Product LP - Interactivity & Atmospheric Simulation
(function () {
  "use strict";

  // --- 1. Weather Presets Data ---
  const weatherProfiles = {
    rain: {
      hpa: 998,
      humidity: 86,
      rate: 45,
      geosmin: 52,
      hinoki: 28,
      bergamot: 12,
      vetiver: 8,
      desc: "気圧降下に伴いジオスミン濃度を最大化。濡れた石畳と落ち葉の清涼なペトリコールが、深い集中の場を作ります。",
      blendName: "雨前・ペトリコール",
      audioFreq: 380,
      audioQ: 2.2,
      particleSpeed: 1.8,
      particleCount: 70,
    },
    sunbreak: {
      hpa: 1012,
      humidity: 52,
      rate: 28,
      geosmin: 15,
      hinoki: 20,
      bergamot: 55,
      vetiver: 10,
      desc: "雨上がりの日差しに合わせてベルガモットと柑橘果皮の香りを優先。澄み渡る大気のような透明感のある空間を作ります。",
      blendName: "薄日・青柚子ブレンド",
      audioFreq: 620,
      audioQ: 1.4,
      particleSpeed: 1.0,
      particleCount: 35,
    },
    breeze: {
      hpa: 1018,
      humidity: 42,
      rate: 20,
      geosmin: 10,
      hinoki: 35,
      bergamot: 40,
      vetiver: 15,
      desc: "乾燥した初夏の風を模した低ミスト設定。月桂樹の清涼感と穏やかな木質香がそよぎます。",
      blendName: "薫風・青葉木質香",
      audioFreq: 850,
      audioQ: 0.9,
      particleSpeed: 2.4,
      particleCount: 25,
    },
    mist: {
      hpa: 1006,
      humidity: 92,
      rate: 55,
      geosmin: 30,
      hinoki: 45,
      bergamot: 5,
      vetiver: 20,
      desc: "夜露と霧の深さを表現。吉野檜の深林の静寂と、湿ったベチバーの根茎香が穏やかな時間を支えます。",
      blendName: "夜霧・吉野深林調",
      audioFreq: 260,
      audioQ: 3.0,
      particleSpeed: 0.6,
      particleCount: 85,
    },
  };

  let activeProfileKey = "rain";

  // --- 2. DOM Elements ---
  const chamberTabs = document.querySelectorAll(".chamber-tab");
  const elHpa = document.getElementById("chamber-hpa");
  const elHumidity = document.getElementById("chamber-humidity");
  const elRate = document.getElementById("chamber-rate");
  const elDesc = document.getElementById("chamber-scent-desc");
  const elBlendName = document.getElementById("hero-blend-name");
  const elHeroWeather = document.getElementById("hero-weather-status");

  const fillGeosmin = document.getElementById("fill-geosmin");
  const fillHinoki = document.getElementById("fill-hinoki");
  const fillBergamot = document.getElementById("fill-bergamot");
  const fillVetiver = document.getElementById("fill-vetiver");

  const pctGeosmin = document.getElementById("pct-geosmin");
  const pctHinoki = document.getElementById("pct-hinoki");
  const pctBergamot = document.getElementById("pct-bergamot");
  const pctVetiver = document.getElementById("pct-vetiver");

  function updateChamber(profileKey) {
    const p = weatherProfiles[profileKey];
    if (!p) return;
    activeProfileKey = profileKey;

    chamberTabs.forEach((tab) => {
      const isCurrent = tab.dataset.weather === profileKey;
      tab.classList.toggle("active", isCurrent);
      tab.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    });

    if (elHpa) elHpa.textContent = p.hpa;
    if (elHumidity) elHumidity.textContent = p.humidity;
    if (elRate) elRate.textContent = p.rate;
    if (elDesc) elDesc.textContent = p.desc;
    if (elBlendName) elBlendName.textContent = p.blendName;
    if (elHeroWeather) {
      elHeroWeather.textContent = `観測気圧 ${p.hpa.toLocaleString()} hPa · 湿度 ${p.humidity}% · ${p.blendName}`;
    }

    if (fillGeosmin) fillGeosmin.style.width = p.geosmin + "%";
    if (fillHinoki) fillHinoki.style.width = p.hinoki + "%";
    if (fillBergamot) fillBergamot.style.width = p.bergamot + "%";
    if (fillVetiver) fillVetiver.style.width = p.vetiver + "%";

    if (pctGeosmin) pctGeosmin.textContent = p.geosmin + "%";
    if (pctHinoki) pctHinoki.textContent = p.hinoki + "%";
    if (pctBergamot) pctBergamot.textContent = p.bergamot + "%";
    if (pctVetiver) pctVetiver.textContent = p.vetiver + "%";

    if (audioFilter && isAudioPlaying) {
      audioFilter.frequency.setTargetAtTime(p.audioFreq, audioCtx.currentTime, 0.1);
      audioFilter.Q.setTargetAtTime(p.audioQ, audioCtx.currentTime, 0.1);
    }
  }

  chamberTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      updateChamber(tab.dataset.weather);
    });
  });

  // --- 3. Dynamic Vapor Canvas Particle Animation ---
  const canvas = document.getElementById("vapor-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let particles = [];
    const maxParticles = 90;

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }

    function initParticles() {
      particles = [];
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < maxParticles; i++) {
        particles.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          size: Math.random() * 2.5 + 1.2,
          opacity: Math.random() * 0.45 + 0.1,
          vx: (Math.random() - 0.5) * 0.3,
          vy: Math.random() * 0.8 + 0.3,
        });
      }
    }

    resizeCanvas();
    initParticles();
    window.addEventListener("resize", () => {
      resizeCanvas();
      initParticles();
    });

    const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function renderParticles() {
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const p = weatherProfiles[activeProfileKey] || weatherProfiles.rain;
      const activeCount = Math.min(p.particleCount, particles.length);

      for (let i = 0; i < activeCount; i++) {
        const pt = particles[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 205, 210, ${pt.opacity})`;
        ctx.fill();

        if (!isReducedMotion) {
          pt.y += pt.vy * p.particleSpeed;
          pt.x += pt.vx;

          if (pt.y > rect.height) {
            pt.y = -10;
            pt.x = Math.random() * rect.width;
          }
        }
      }

      requestAnimationFrame(renderParticles);
    }

    requestAnimationFrame(renderParticles);
  }

  // --- 4. Web Audio Ambient Sound Synthesis ---
  let audioCtx = null;
  let noiseNode = null;
  let audioFilter = null;
  let gainNode = null;
  let isAudioPlaying = false;

  const audioToggleBtn = document.getElementById("audio-toggle-btn");
  const audioLabel = document.getElementById("audio-label");
  const volumeSlider = document.getElementById("volume-slider");

  function createNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function startAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const p = weatherProfiles[activeProfileKey] || weatherProfiles.rain;

    const noiseBuffer = createNoiseBuffer(audioCtx);
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    audioFilter = audioCtx.createBiquadFilter();
    audioFilter.type = "bandpass";
    audioFilter.frequency.setValueAtTime(p.audioFreq, audioCtx.currentTime);
    audioFilter.Q.setValueAtTime(p.audioQ, audioCtx.currentTime);

    gainNode = audioCtx.createGain();
    const volume = (volumeSlider ? Number(volumeSlider.value) : 30) / 100 * 0.4;
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);

    noiseNode.connect(audioFilter);
    audioFilter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseNode.start();
    isAudioPlaying = true;

    if (audioToggleBtn) {
      audioToggleBtn.setAttribute("aria-pressed", "true");
      if (audioLabel) audioLabel.textContent = "試聴音を一時停止";
    }
  }

  function stopAudio() {
    if (noiseNode) {
      try {
        noiseNode.stop();
        noiseNode.disconnect();
      } catch (e) {}
      noiseNode = null;
    }
    isAudioPlaying = false;
    if (audioToggleBtn) {
      audioToggleBtn.setAttribute("aria-pressed", "false");
      if (audioLabel) audioLabel.textContent = "環境音を試聴する";
    }
  }

  if (audioToggleBtn) {
    audioToggleBtn.addEventListener("click", () => {
      if (isAudioPlaying) {
        stopAudio();
      } else {
        startAudio();
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", (e) => {
      if (gainNode && audioCtx) {
        const val = (Number(e.target.value) / 100) * 0.4;
        gainNode.gain.setValueAtTime(val, audioCtx.currentTime);
      }
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isAudioPlaying) {
      stopAudio();
    }
  });

  // --- 5. Craft Swatch Picker ---
  const swatchButtons = document.querySelectorAll(".swatch-btn");
  const craftPreview = document.getElementById("craft-preview");
  const colorBadgeText = document.getElementById("color-badge-text");
  const silhouette = document.querySelector(".product-silhouette");

  const colorMeta = {
    charcoal: {
      label: "墨黒 / CHARCOAL SLATE",
      colorBg: "#242930",
    },
    celadon: {
      label: "青磁 / CELADON MIST",
      colorBg: "#475a5e",
    },
    frost: {
      label: "白雨 / FROST SILVER",
      colorBg: "#adb9c1",
    },
  };

  swatchButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const colorKey = btn.dataset.color;
      const meta = colorMeta[colorKey];
      if (!meta) return;

      swatchButtons.forEach((b) => {
        const match = b === btn;
        b.classList.toggle("active", match);
        b.setAttribute("aria-pressed", match ? "true" : "false");
      });

      if (craftPreview) {
        craftPreview.dataset.color = colorKey;
        const renderEl = craftPreview.querySelector(".color-body-render");
        if (renderEl) renderEl.style.background = meta.colorBg;
      }
      if (colorBadgeText) colorBadgeText.textContent = meta.label;
      if (silhouette) silhouette.dataset.color = colorKey;
    });
  });

  // --- 6. Mobile Navigation Toggle ---
  const menuToggle = document.querySelector(".menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", () => {
      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", !isExpanded);
      mobileNav.hidden = isExpanded;
    });

    mobileNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menuToggle.setAttribute("aria-expanded", "false");
        mobileNav.hidden = true;
      });
    });
  }

  // --- 7. Modal Reservation Dialog ---
  const reserveTriggers = document.querySelectorAll("[data-reserve-trigger]");
  const reserveDialog = document.getElementById("reserve-dialog");
  const dialogCloseBtn = document.getElementById("dialog-close-btn");
  const successCloseBtn = document.getElementById("success-close-btn");
  const reserveForm = document.getElementById("reserve-form");
  const reserveSuccess = document.getElementById("reserve-success");

  let lastActiveElement = null;

  function openReserveDialog() {
    if (!reserveDialog) return;
    lastActiveElement = document.activeElement;
    if (reserveForm) {
      reserveForm.hidden = false;
      reserveForm.reset();
      reserveForm.querySelectorAll(".form-group").forEach((g) => g.classList.remove("has-error"));
    }
    if (reserveSuccess) reserveSuccess.hidden = true;

    if (typeof reserveDialog.showModal === "function") {
      reserveDialog.showModal();
    } else {
      reserveDialog.setAttribute("open", "");
    }

    const firstInput = reserveDialog.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  function closeReserveDialog() {
    if (!reserveDialog) return;
    if (typeof reserveDialog.close === "function") {
      reserveDialog.close();
    } else {
      reserveDialog.removeAttribute("open");
    }
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  reserveTriggers.forEach((btn) => {
    btn.addEventListener("click", openReserveDialog);
  });

  if (dialogCloseBtn) {
    dialogCloseBtn.addEventListener("click", closeReserveDialog);
  }
  if (successCloseBtn) {
    successCloseBtn.addEventListener("click", closeReserveDialog);
  }

  if (reserveDialog) {
    reserveDialog.addEventListener("click", (e) => {
      if (e.target === reserveDialog) {
        closeReserveDialog();
      }
    });

    reserveDialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeReserveDialog();
      }
    });
  }

  if (reserveForm) {
    reserveForm.addEventListener("submit", (e) => {
      e.preventDefault();
      let hasError = false;

      const nameInput = document.getElementById("reserve-name");
      const emailInput = document.getElementById("reserve-email");

      if (nameInput) {
        const group = nameInput.closest(".form-group");
        if (!nameInput.value.trim()) {
          group.classList.add("has-error");
          hasError = true;
        } else {
          group.classList.remove("has-error");
        }
      }

      if (emailInput) {
        const group = emailInput.closest(".form-group");
        const val = emailInput.value.trim();
        const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        if (!emailValid) {
          group.classList.add("has-error");
          hasError = true;
        } else {
          group.classList.remove("has-error");
        }
      }

      if (!hasError) {
        reserveForm.hidden = true;
        if (reserveSuccess) {
          reserveSuccess.hidden = false;
          if (successCloseBtn) successCloseBtn.focus();
        }
      }
    });
  }
})();
