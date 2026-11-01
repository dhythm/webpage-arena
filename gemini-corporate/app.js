// SHINRA Timber Engineering Co. — Corporate Homepage JS
(function () {
  "use strict";

  // --- 1. Algorithmic Joinery CAD Data ---
  const jointsData = {
    kanawa: {
      code: "KANAWA-HYBRID MOMENT CONNECTION (KH-01)",
      capacity: "380 kN·m",
      deformation: "1/120 rad",
      failure: "木材支圧降伏（高靭性）",
      testing: "震度7・JMA神戸波クリア",
      desc: "伝統の「金輪継ぎ」の噛み合わせ幾何学を大断面集成材（360×600mm）に拡大。内部に高強度炭素繊維複合材（CFRP）インサートと高力ボルトを隠蔽配置し、金物を露出させずに鉄骨造同等の曲げ耐力と木質美観を両立します。",
      draw(svgGroup, vectors) {
        let markup = `
          <!-- Column (Vertical) -->
          <rect x="250" y="40" width="100" height="300" fill="#2d3330" stroke="#c89658" stroke-width="2"/>
          <line x1="280" y1="40" x2="280" y2="340" stroke="#3d4541" stroke-width="1"/>
          <line x1="320" y1="40" x2="320" y2="340" stroke="#3d4541" stroke-width="1"/>

          <!-- Beam Left -->
          <path d="M 60 150 L 250 150 L 250 230 L 60 230 Z" fill="#38403c" stroke="#c89658" stroke-width="2"/>
          <!-- Beam Right -->
          <path d="M 350 150 L 540 150 L 540 230 L 350 230 Z" fill="#38403c" stroke="#c89658" stroke-width="2"/>

          <!-- Interlocking Kanawa Key Geometry (Center node) -->
          <path d="M 270 170 L 310 160 L 330 180 L 290 190 Z" fill="#c89658" opacity="0.8"/>
          <path d="M 270 200 L 310 190 L 330 210 L 290 220 Z" fill="#c89658" opacity="0.8"/>

          <!-- Internal CFRP Rods -->
          <line x1="180" y1="165" x2="420" y2="165" stroke="#9daab5" stroke-width="3" stroke-dasharray="6,4"/>
          <line x1="180" y1="215" x2="420" y2="215" stroke="#9daab5" stroke-width="3" stroke-dasharray="6,4"/>

          <!-- Drift Pins -->
          <circle cx="210" cy="190" r="4.5" fill="#bd3220"/>
          <circle cx="230" cy="190" r="4.5" fill="#bd3220"/>
          <circle cx="370" cy="190" r="4.5" fill="#bd3220"/>
          <circle cx="390" cy="190" r="4.5" fill="#bd3220"/>
        `;

        // Moment Vectors (M)
        if (vectors.moment) {
          markup += `
            <g class="v-layer-moment">
              <path d="M 120 130 C 140 110, 180 110, 200 130" fill="none" stroke="#e06c75" stroke-width="3" marker-end="url(#arrow-red)"/>
              <path d="M 400 130 C 420 110, 460 110, 480 130" fill="none" stroke="#e06c75" stroke-width="3" marker-end="url(#arrow-red)"/>
              <text x="145" y="100" fill="#e06c75" font-size="12" font-family="monospace">M = 380 kN·m</text>
            </g>
          `;
        }

        // Shear Vectors (Q)
        if (vectors.shear) {
          markup += `
            <g class="v-layer-shear">
              <line x1="160" y1="140" x2="160" y2="240" stroke="#61afef" stroke-width="2.5"/>
              <polygon points="160,245 155,235 165,235" fill="#61afef"/>
              <line x1="440" y1="240" x2="440" y2="140" stroke="#61afef" stroke-width="2.5"/>
              <polygon points="440,135 435,145 445,145" fill="#61afef"/>
              <text x="170" y="240" fill="#61afef" font-size="12" font-family="monospace">Q = 210 kN</text>
            </g>
          `;
        }

        // Axial Vectors (N)
        if (vectors.axial) {
          markup += `
            <g class="v-layer-axial">
              <line x1="300" y1="20" x2="300" y2="50" stroke="#98c379" stroke-width="3"/>
              <polygon points="300,55 295,45 305,45" fill="#98c379"/>
              <text x="310" y="35" fill="#98c379" font-size="12" font-family="monospace">N = 850 kN</text>
            </g>
          `;
        }

        svgGroup.innerHTML = markup;
      },
    },

    sanpo: {
      code: "SANPO-ZASHI 3D TRUSS NODE (ST-02)",
      capacity: "520 kN",
      deformation: "1/150 rad",
      failure: "鋼管コッターせん断降伏",
      testing: "積雪2.5m偏載荷重加振実証済",
      desc: "大空間アリーナの屋根架構向け立体トラス節点。三次元直交する3材（柱・主トラス・斜材）を特殊仕口で噛み合わせ、中心部に高力炭素鋼ロッドを貫通。金物フランジを使わずに純木造の軽やかな格子の天井を実現します。",
      draw(svgGroup, vectors) {
        let markup = `
          <!-- Main Vertical Column -->
          <polygon points="260,60 340,60 350,330 250,330" fill="#2d3330" stroke="#c89658" stroke-width="2"/>

          <!-- Diagonal Truss Upper Left -->
          <polygon points="100,100 260,170 240,200 80,130" fill="#38403c" stroke="#c89658" stroke-width="2"/>

          <!-- Diagonal Truss Upper Right -->
          <polygon points="500,100 340,170 360,200 520,130" fill="#38403c" stroke="#c89658" stroke-width="2"/>

          <!-- Horizontal Chord -->
          <rect x="120" y="180" width="360" height="40" fill="#444d48" stroke="#c89658" stroke-width="1.8"/>

          <!-- Center Node Interlock Ring -->
          <circle cx="300" cy="190" r="32" fill="#222825" stroke="#bd3220" stroke-width="2.5"/>
          <circle cx="300" cy="190" r="14" fill="#c89658"/>
          <circle cx="300" cy="190" r="5" fill="#bd3220"/>
        `;

        if (vectors.moment) {
          markup += `
            <g class="v-layer-moment">
              <path d="M 270 150 A 40 40 0 0 1 330 150" fill="none" stroke="#e06c75" stroke-width="3"/>
              <polygon points="332,154 326,145 336,147" fill="#e06c75"/>
              <text x="340" y="145" fill="#e06c75" font-size="12" font-family="monospace">M = 240 kN·m</text>
            </g>
          `;
        }

        if (vectors.shear) {
          markup += `
            <g class="v-layer-shear">
              <line x1="300" y1="130" x2="300" y2="180" stroke="#61afef" stroke-width="3"/>
              <polygon points="300,185 295,175 305,175" fill="#61afef"/>
              <text x="310" y="160" fill="#61afef" font-size="12" font-family="monospace">Q = 520 kN</text>
            </g>
          `;
        }

        if (vectors.axial) {
          markup += `
            <g class="v-layer-axial">
              <line x1="120" y1="110" x2="240" y2="165" stroke="#98c379" stroke-width="3"/>
              <polygon points="245,167 235,162 238,172" fill="#98c379"/>
              <line x1="480" y1="110" x2="360" y2="165" stroke="#98c379" stroke-width="3"/>
              <polygon points="355,167 362,172 365,162" fill="#98c379"/>
              <text x="140" y="95" fill="#98c379" font-size="12" font-family="monospace">N = 450 kN (Tension)</text>
            </g>
          `;
        }

        svgGroup.innerHTML = markup;
      },
    },

    clt: {
      code: "CLT ECCENTRIC BRACE CORE (CB-03)",
      capacity: "940 kN",
      deformation: "1/100 rad",
      failure: "CLTスリット引張破断型制御",
      testing: "実大3層加振試験・減衰比8.5%",
      desc: "5層5プライの国産スギ直交集成板（CLT）の中央にレーザー精密スリットを加工した制振耐震壁。巨大地震の水平力に対し、スリットが塑性変形することでエネルギーを吸収し、主構造躯体の損傷をゼロに抑えます。",
      draw(svgGroup, vectors) {
        let markup = `
          <!-- Outer Structural Columns -->
          <rect x="80" y="50" width="60" height="280" fill="#2d3330" stroke="#c89658" stroke-width="2"/>
          <rect x="460" y="50" width="60" height="280" fill="#2d3330" stroke="#c89658" stroke-width="2"/>

          <!-- CLT Massive Panel -->
          <rect x="140" y="70" width="320" height="240" fill="#3c4540" stroke="#c89658" stroke-width="2"/>

          <!-- Lamella Cross Grain Indications -->
          <line x1="140" y1="118" x2="460" y2="118" stroke="#4c5650" stroke-width="1.5"/>
          <line x1="140" y1="166" x2="460" y2="166" stroke="#4c5650" stroke-width="1.5"/>
          <line x1="140" y1="214" x2="460" y2="214" stroke="#4c5650" stroke-width="1.5"/>
          <line x1="140" y1="262" x2="460" y2="262" stroke="#4c5650" stroke-width="1.5"/>

          <!-- Laser-Cut Slit Dampers (Center) -->
          <rect x="280" y="110" width="40" height="160" fill="#191d1b" stroke="#bd3220" stroke-width="2"/>
          <line x1="300" y1="120" x2="300" y2="260" stroke="#bd3220" stroke-width="3" stroke-dasharray="8,6"/>
        `;

        if (vectors.moment) {
          markup += `
            <g class="v-layer-moment">
              <path d="M 120 310 C 130 270, 170 270, 180 310" fill="none" stroke="#e06c75" stroke-width="3"/>
              <text x="140" y="260" fill="#e06c75" font-size="12" font-family="monospace">Overt. M = 680 kN·m</text>
            </g>
          `;
        }

        if (vectors.shear) {
          markup += `
            <g class="v-layer-shear">
              <line x1="100" y1="60" x2="260" y2="60" stroke="#61afef" stroke-width="3.5"/>
              <polygon points="265,60 255,55 255,65" fill="#61afef"/>
              <text x="140" y="50" fill="#61afef" font-size="12" font-family="monospace">Base Shear Q = 940 kN</text>
            </g>
          `;
        }

        if (vectors.axial) {
          markup += `
            <g class="v-layer-axial">
              <line x1="110" y1="30" x2="110" y2="60" stroke="#98c379" stroke-width="3"/>
              <polygon points="110,65 105,55 115,55" fill="#98c379"/>
              <line x1="490" y1="30" x2="490" y2="60" stroke="#98c379" stroke-width="3"/>
              <polygon points="490,65 485,55 495,55" fill="#98c379"/>
              <text x="440" y="25" fill="#98c379" font-size="12" font-family="monospace">N = 1,400 kN</text>
            </g>
          `;
        }

        svgGroup.innerHTML = markup;
      },
    },
  };

  let activeJointKey = "kanawa";
  const activeVectors = {
    moment: true,
    shear: true,
    axial: true,
  };

  const jointTabs = document.querySelectorAll(".joint-tab");
  const cadSvgGroup = document.getElementById("cad-drawings");
  const cadTitle = document.getElementById("cad-joint-title");
  const valCapacity = document.getElementById("val-capacity");
  const valDeformation = document.getElementById("val-deformation");
  const valFailure = document.getElementById("val-failure");
  const valTesting = document.getElementById("val-testing");
  const jointDescText = document.getElementById("joint-desc-text");
  const vectorButtons = document.querySelectorAll(".vector-btn");

  function renderJoint() {
    const data = jointsData[activeJointKey];
    if (!data) return;

    if (cadTitle) cadTitle.textContent = data.code;
    if (valCapacity) valCapacity.textContent = data.capacity;
    if (valDeformation) valDeformation.textContent = data.deformation;
    if (valFailure) valFailure.textContent = data.failure;
    if (valTesting) valTesting.textContent = data.testing;
    if (jointDescText) jointDescText.textContent = data.desc;

    if (cadSvgGroup) {
      data.draw(cadSvgGroup, activeVectors);
    }
  }

  jointTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.joint;
      if (!jointsData[key]) return;
      activeJointKey = key;

      jointTabs.forEach((t) => {
        const isSelected = t === tab;
        t.classList.toggle("active", isSelected);
        t.setAttribute("aria-pressed", isSelected ? "true" : "false");
      });

      renderJoint();
    });
  });

  vectorButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const vectorType = btn.dataset.vector;
      activeVectors[vectorType] = !activeVectors[vectorType];

      btn.classList.toggle("active", activeVectors[vectorType]);
      btn.setAttribute("aria-pressed", activeVectors[vectorType] ? "true" : "false");

      renderJoint();
    });
  });

  renderJoint();

  // --- 2. Portfolio Category Filtering ---
  const filterPills = document.querySelectorAll(".filter-pill");
  const workCards = document.querySelectorAll(".work-card");

  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const filter = pill.dataset.filter;

      filterPills.forEach((p) => {
        const isMatch = p === pill;
        p.classList.toggle("active", isMatch);
        p.setAttribute("aria-pressed", isMatch ? "true" : "false");
      });

      workCards.forEach((card) => {
        if (filter === "all" || card.dataset.category === filter) {
          card.style.display = "";
        } else {
          card.style.display = "none";
        }
      });
    });
  });

  // --- 3. Carbon Sink & Cost Simulator ---
  const floorsRange = document.getElementById("floors-range");
  const areaRange = document.getElementById("area-range");
  const floorsDisplay = document.getElementById("floors-display");
  const areaDisplay = document.getElementById("area-display");

  const resCarbon = document.getElementById("res-carbon");
  const resWood = document.getElementById("res-wood");
  const resCo2Reduction = document.getElementById("res-co2-reduction");
  const resWeightReduction = document.getElementById("res-weight-reduction");
  const resTimeReduction = document.getElementById("res-time-reduction");

  function calculateSimulation() {
    if (!floorsRange || !areaRange) return;

    const floors = parseInt(floorsRange.value, 10);
    const area = parseInt(areaRange.value, 10);

    if (floorsDisplay) floorsDisplay.textContent = `${floors} 階`;
    if (areaDisplay) areaDisplay.textContent = `${area.toLocaleString()} m²`;

    // Empirical mass-timber structural ratios
    const woodPerM2 = 0.22 + (floors - 3) * 0.012;
    const woodTotal = Math.round(area * woodPerM2);
    const carbonTotal = Math.round(woodTotal * 0.82);
    const co2ReductionPct = Math.min(58, Math.round(36 + floors * 1.4));
    const weightReductionPct = Math.min(48, Math.round(30 + floors * 0.9));
    const timeSavedMonths = (1.2 + (floors * 0.12) * (area / 4500)).toFixed(1);

    if (resCarbon) resCarbon.textContent = carbonTotal.toLocaleString();
    if (resWood) resWood.innerHTML = `${woodTotal.toLocaleString()} <small>m³</small>`;
    if (resCo2Reduction) resCo2Reduction.innerHTML = `-${co2ReductionPct} <small>%</small>`;
    if (resWeightReduction) resWeightReduction.innerHTML = `-${weightReductionPct} <small>%</small>`;
    if (resTimeReduction) resTimeReduction.innerHTML = `約 ${timeSavedMonths} <small>ヶ月</small>`;
  }

  if (floorsRange) floorsRange.addEventListener("input", calculateSimulation);
  if (areaRange) areaRange.addEventListener("input", calculateSimulation);

  calculateSimulation();

  // --- 4. Mobile Nav Drawer ---
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

  // --- 5. Feasibility Study Modal Dialog ---
  const fsTriggers = document.querySelectorAll("[data-fs-modal-trigger]");
  const fsDialog = document.getElementById("fs-dialog");
  const dialogCloseBtn = document.getElementById("dialog-close-btn");
  const successCloseBtn = document.getElementById("success-close-btn");
  const fsForm = document.getElementById("fs-form");
  const fsSuccess = document.getElementById("fs-success");

  let lastActiveElement = null;

  function openFsModal() {
    if (!fsDialog) return;
    lastActiveElement = document.activeElement;
    if (fsForm) {
      fsForm.hidden = false;
      fsForm.reset();
      fsForm.querySelectorAll(".form-col").forEach((col) => col.classList.remove("has-err"));
    }
    if (fsSuccess) fsSuccess.hidden = true;

    if (typeof fsDialog.showModal === "function") {
      fsDialog.showModal();
    } else {
      fsDialog.setAttribute("open", "");
    }

    const firstInput = fsDialog.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  function closeFsModal() {
    if (!fsDialog) return;
    if (typeof fsDialog.close === "function") {
      fsDialog.close();
    } else {
      fsDialog.removeAttribute("open");
    }
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
  }

  fsTriggers.forEach((trigger) => {
    trigger.addEventListener("click", openFsModal);
  });

  if (dialogCloseBtn) dialogCloseBtn.addEventListener("click", closeFsModal);
  if (successCloseBtn) successCloseBtn.addEventListener("click", closeFsModal);

  if (fsDialog) {
    fsDialog.addEventListener("click", (e) => {
      if (e.target === fsDialog) closeFsModal();
    });

    fsDialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeFsModal();
    });
  }

  if (fsForm) {
    fsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      let hasError = false;

      const compInput = document.getElementById("fs-company");
      const nameInput = document.getElementById("fs-name");
      const emailInput = document.getElementById("fs-email");

      if (compInput) {
        const col = compInput.closest(".form-col");
        if (!compInput.value.trim()) {
          col.classList.add("has-err");
          hasError = true;
        } else {
          col.classList.remove("has-err");
        }
      }

      if (nameInput) {
        const col = nameInput.closest(".form-col");
        if (!nameInput.value.trim()) {
          col.classList.add("has-err");
          hasError = true;
        } else {
          col.classList.remove("has-err");
        }
      }

      if (emailInput) {
        const col = emailInput.closest(".form-col");
        const val = emailInput.value.trim();
        const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        if (!valid) {
          col.classList.add("has-err");
          hasError = true;
        } else {
          col.classList.remove("has-err");
        }
      }

      if (!hasError) {
        fsForm.hidden = true;
        if (fsSuccess) {
          fsSuccess.hidden = false;
          if (successCloseBtn) successCloseBtn.focus();
        }
      }
    });
  }
})();
