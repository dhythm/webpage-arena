const menuToggle = document.querySelector(".menu-toggle");
const ticker = document.querySelector(".ticker");
ticker.removeAttribute("aria-hidden");
ticker.querySelector("div").setAttribute("aria-hidden", "true");
const motionToggle = document.createElement("button");
motionToggle.className = "motion-toggle";
motionToggle.type = "button";
motionToggle.textContent = "動きを止める Ⅱ";
motionToggle.setAttribute("aria-pressed", "false");
motionToggle.addEventListener("click", () => {
  const paused = document.body.classList.toggle("motion-paused");
  motionToggle.setAttribute("aria-pressed", paused);
  motionToggle.textContent = paused ? "動きを再開する ▶" : "動きを止める Ⅱ";
});
ticker.append(motionToggle);
const mobileNav = document.querySelector("#mobile-nav");
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", open);
  menuToggle.setAttribute(
    "aria-label",
    open ? "メニューを閉じる" : "メニューを開く",
  );
  mobileNav.hidden = !open;
});
mobileNav.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    mobileNav.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "メニューを開く");
  }),
);
const projectData = {
  forest: {
    category: "P.001 / REGENERATION",
    title: "海の森を、もう一度。",
    intro: "失われつつある海藻の森。その再生を、地域とともに続く仕組みへ。",
    heading: "海を育てることを、産業に。",
    body: "沿岸域の環境を調べ、地域の海に適した海藻を育てる。水温や生育状況を記録し、生態系の回復を丁寧に確かめながら、ブルーカーボンの可能性を検討する研究構想です。",
    items: [
      "地域の漁業者と連携した小規模な育成実証",
      "水中映像と環境データによる継続観測",
      "生態系の変化と地域経済をつなぐ事業設計",
    ],
  },
  material: {
    category: "P.002 / NEW MATERIALS",
    title: "海藻から、日常の素材へ。",
    intro: "海で育つ資源を、使い終えたあとまで考えた新しい素材へ。",
    heading: "素材の一生を、デザインする。",
    body: "海藻に含まれる成分の特性を活かし、包装材や日用品への応用を探る素材研究。加工のしやすさや耐久性とともに、回収方法や使用後の環境も含めて検証する構想です。",
    items: [
      "海藻由来の成分を用いた試作と性能評価",
      "デザイナー・メーカーとの用途開発",
      "原料調達から使用後までを見据えた循環設計",
    ],
  },
  community: {
    category: "P.003 / CO-CREATION",
    title: "海の未来を、まちの仕事に。",
    intro: "海のことは、海と暮らす人たちと考える。地域の知恵から生まれる共創。",
    heading: "地域の問いから、はじめよう。",
    body: "漁業者や住民、研究者、企業が同じテーブルで考えるオープンラボ。海辺の暮らしで見つかる小さな問いを、学びや新しい事業の種に変えていくプログラム構想です。",
    items: [
      "地域の課題を持ち寄る対話の場づくり",
      "海辺のフィールドワークと体験型の学び",
      "地域で続けられる事業アイデアの試行",
    ],
  },
};
const articles = [
  {
    category: "FIELD NOTE / 2026.10.20",
    title: "海藻の森を測る。水中の「豊かさ」はどう見える？",
    intro:
      "海面からは見えない、もうひとつの森。そこに広がる豊かさを、どんなものさしで捉えられるでしょうか。",
    body: "水中の様子を記録するなら、まずは同じ場所に繰り返し通うことから。海藻の広がり、光の届き方、見かける生きもの。ひとつの数値だけではわからない変化を、映像と観察メモを重ねて読み解いていきます。",
    extra:
      "季節によって変わる海の表情を、一度の観測で結論づけない。小さな記録を続ける姿勢が、海の再生を考える土台になると、私たちは考えています。",
  },
  {
    category: "MATERIAL LAB / 2026.10.08",
    title: "素材のはじまりを、海に探して。",
    intro:
      "新しい素材を考えるとき、私たちは「どこから来て、どこへ行くのか」を問い直します。",
    body: "海藻由来の素材は、原料を置き換えるだけでは完成しません。育て方や加工のエネルギー、使う場面、使い終えたあとの行き先まで。それぞれの条件を揃えながら、用途に合った可能性を探ります。",
    extra:
      "試作品を手に取り、曲げ、濡らし、使ってみる。期待どおりにいかない結果にも、次のアイデアへのヒントがあります。",
  },
  {
    category: "PEOPLE & PLACE / 2026.09.24",
    title: "漁港のテーブルから、新しい共創がはじまる。",
    intro:
      "研究室の外で交わす何気ない会話が、ときに新しい問いの入口になります。",
    body: "日々の漁で感じる海の変化。使い道を探している地域の資源。次の世代へ残したい風景。立場の異なる人たちが話すことで、ひとりでは気づけない関係が見えてきます。",
    extra:
      "まずは話を聴くことから。大きな計画の前に、小さく試せることを一緒に探す。地域との協働では、その順番を大切にしたいと考えています。",
  },
];
const detailDialog = document.querySelector(".detail-dialog");
function openDetail(category, title, paragraphs, items = []) {
  document.querySelector("#detail-category").textContent = category;
  document.querySelector("#detail-title").textContent = title;
  const content = document.querySelector("#detail-content");
  content.replaceChildren();
  for (const [tag, text] of paragraphs) {
    const element = document.createElement(tag);
    element.textContent = text;
    content.append(element);
  }
  if (items.length) {
    const list = document.createElement("ul");
    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.append(li);
    });
    content.append(list);
  }
  const foot = document.createElement("p");
  foot.className = "detail-foot";
  foot.textContent =
    "この内容は架空の企業のデザインコンセプトです。実在する研究・成果・取材記録ではありません。";
  content.append(foot);
  detailDialog.showModal();
}
document.querySelectorAll("[data-project]").forEach((button) =>
  button.addEventListener("click", () => {
    const p = projectData[button.dataset.project];
    openDetail(
      p.category,
      p.title,
      [
        ["p", p.intro],
        ["h3", p.heading],
        ["p", p.body],
      ],
      p.items,
    );
  }),
);
document.querySelectorAll("[data-journal]").forEach((button) =>
  button.addEventListener("click", () => {
    const p = articles[Number(button.dataset.journal)];
    openDetail(p.category, p.title, [
      ["p", p.intro],
      ["p", p.body],
      ["p", p.extra],
    ]);
  }),
);
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-filter]")
      .forEach((item) => item.setAttribute("aria-pressed", item === button));
    let count = 0;
    document.querySelectorAll("[data-category]").forEach((card) => {
      const visible =
        button.dataset.filter === "all" ||
        button.dataset.filter === card.dataset.category;
      card.hidden = !visible;
      if (visible) count++;
    });
    document.querySelector("#filter-status").textContent =
      `${count}件のプロジェクトを表示しています。`;
  }),
);
const contactDialog = document.querySelector(".contact-dialog");
const form = contactDialog.querySelector("form");
const success = contactDialog.querySelector(".contact-success");
document.querySelectorAll("[data-contact]").forEach((button) =>
  button.addEventListener("click", () => {
    if (detailDialog.open) detailDialog.close();
    form.hidden = false;
    success.hidden = true;
    form.reset();
    contactDialog.showModal();
  }),
);
document.querySelectorAll("dialog").forEach((dialog) => {
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
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
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
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  form.hidden = true;
  success.hidden = false;
  success.querySelector("button").focus();
});
success
  .querySelector("button")
  .addEventListener("click", () => contactDialog.close());
