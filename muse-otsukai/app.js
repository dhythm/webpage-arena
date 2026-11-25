// おつかい：体験デモ（ブラウザの中で完結し、入力は外部に送信されません）

const initialItems = [
  { text: "牛乳 1本", state: "todo" },
  { text: "卵 1パック", state: "todo" },
  { text: "いつもの醤油", state: "done" },
  { text: "豆腐（絹）", state: "todo" },
];

let items = [...initialItems];
let role = "ask"; // "ask" = たのむ人, "go" = いく人

const listEl = document.getElementById("memo-list");
const progressEl = document.getElementById("memo-progress");
const hintEl = document.getElementById("demo-hint");
const addForm = document.getElementById("memo-add");
const addInput = document.getElementById("memo-input");
const addButton = addForm.querySelector("button");
const askBtn = document.getElementById("role-ask");
const goBtn = document.getElementById("role-go");

function render() {
  listEl.innerHTML = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "memo-item" + (item.state === "done" ? " is-done" : "") + (item.state === "missing" ? " is-missing" : "");

    const check = document.createElement("button");
    check.type = "button";
    check.className = "memo-check";
    check.textContent = item.state === "done" ? "✓" : "";
    check.setAttribute("aria-label", item.state === "done" ? `${item.text}（買えた。押すと戻す）` : `${item.text} を買えたことにする`);
    check.disabled = role !== "go";
    check.addEventListener("click", () => {
      item.state = item.state === "done" ? "todo" : "done";
      render();
    });

    const text = document.createElement("span");
    text.className = "memo-text";
    text.textContent = item.text;

    li.append(check, text);

    if (item.state !== "done") {
      const missing = document.createElement("button");
      missing.type = "button";
      missing.className = "memo-missing";
      missing.textContent = item.state === "missing" ? "なかった ✓" : "なかった";
      missing.disabled = role !== "go";
      missing.addEventListener("click", () => {
        item.state = item.state === "missing" ? "todo" : "missing";
        render();
      });
      li.append(missing);
    }
    listEl.append(li);
  });

  const done = items.filter((i) => i.state === "done").length;
  const missing = items.filter((i) => i.state === "missing").length;
  const rest = items.length - done - missing;
  progressEl.textContent = items.length === 0
    ? "メモは空です。たのむ人が足すのを待っています。"
    : `買えた ${done}件／なかった ${missing}件／あと ${rest}件`;

  const isAsk = role === "ask";
  askBtn.classList.toggle("is-active", isAsk);
  askBtn.setAttribute("aria-pressed", String(isAsk));
  goBtn.classList.toggle("is-active", !isAsk);
  goBtn.setAttribute("aria-pressed", String(!isAsk));
  addInput.disabled = !isAsk;
  addButton.disabled = !isAsk;
  hintEl.textContent = isAsk
    ? "たのむ人：買ってほしいものを足せます。チェックは店にいる人だけが押せます。"
    : "いく人：買えたらチェック、「なかった」も印をつけられます。追加はできません。";
}

askBtn.addEventListener("click", () => { role = "ask"; render(); });
goBtn.addEventListener("click", () => { role = "go"; render(); });

addForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = addInput.value.trim();
  if (!text) return;
  items.push({ text, state: "todo" });
  addInput.value = "";
  render();
});

render();

// 入手案内（デモ）
const getOutput = document.getElementById("get-output");
document.querySelectorAll(".store-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    getOutput.textContent = `「おつかい」は架空のアプリのため、${btn.dataset.store} のストアでは配布していません。これはデモの案内です。`;
  });
});
