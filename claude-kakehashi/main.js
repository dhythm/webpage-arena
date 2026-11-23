(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width: 640px)");
  const yen = (n) => `${n.toLocaleString("ja-JP")}円`;
  const comma = (n) => n.toLocaleString("ja-JP");
  const setText = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };

  const ledger = document.getElementById("hero-ledger");
  if (ledger) {
    const settle = () => ledger.setAttribute("data-settled", "");
    if (reduce.matches) {
      settle();
    } else {
      const stamps = ledger.querySelectorAll(".stamp");
      const last = stamps[stamps.length - 1];
      last?.addEventListener("animationend", settle, { once: true });
      window.setTimeout(settle, 3500);
    }
  }

  const FEE_LIMIT = 880;

  const initialInvoices = () => [
    { id: "2610-022", company: "野々村建具", amount: 48400, due: "10/31", late: true },
    { id: "2611-014", company: "山根製作所", amount: 132000, due: "11/30" },
    { id: "2611-015", company: "青葉商店", amount: 55000, due: "11/30" },
    { id: "2611-016", company: "白鷺デザイン", amount: 33000, due: "11/30" },
    { id: "2611-017", company: "白鷺デザイン", amount: 77000, due: "11/30" },
    { id: "2611-018", company: "ミナト運送", amount: 264000, due: "12/10" },
  ];

  const initialDeposits = () => [
    { id: "d1", date: "11-25", name: "ﾌﾘｺﾐ ｶ)ﾔﾏﾈｾｲｻｸｼﾖ", amount: 132000 },
    { id: "d2", date: "11-26", name: "ﾌﾘｺﾐ ﾕ)ｱｵﾊﾞｼﾖｳﾃﾝ", amount: 54560 },
    { id: "d3", date: "11-27", name: "ﾌﾘｺﾐ ｶ)ｼﾗｻｷﾞﾃﾞｻﾞｲﾝ", amount: 110000 },
    { id: "d4", date: "11-28", name: "ﾌﾘｺﾐ ﾐﾅﾄｳﾝｿｳ(ﾄﾞ", amount: 264000 },
    { id: "d5", date: "11-28", name: "ﾘｿｸ", amount: 12, interest: true },
  ];

  const initialNames = () => ({
    "ﾌﾘｺﾐ ｶ)ﾔﾏﾈｾｲｻｸｼﾖ": "山根製作所",
    "ﾌﾘｺﾐ ﾕ)ｱｵﾊﾞｼﾖｳﾃﾝ": "青葉商店",
    "ﾌﾘｺﾐ ｶ)ｼﾗｻｷﾞﾃﾞｻﾞｲﾝ": "白鷺デザイン",
  });

  const app = document.getElementById("demo-app");
  if (app) {
    const els = {
      deposits: document.getElementById("deposit-list"),
      invoices: document.getElementById("invoice-list"),
      check: document.getElementById("check-body"),
      tallyDeposits: document.getElementById("tally-deposits"),
      tallyInvoices: document.getElementById("tally-invoices"),
      tallyAmount: document.getElementById("tally-amount"),
      journalEmpty: document.getElementById("journal-empty"),
      journalTable: document.getElementById("journal-table"),
      journalBody: document.getElementById("journal-body"),
      status: document.getElementById("demo-status"),
      reset: document.getElementById("demo-reset"),
    };
    const panel = document.getElementById("demo-check");

    let state;
    const fresh = () => ({
      invoices: initialInvoices(),
      deposits: initialDeposits(),
      names: initialNames(),
      done: new Set(),
      selectedDeposit: null,
      checked: new Set(),
      fresh: new Set(),
    });

    const openInvoices = () => state.invoices.filter((inv) => !state.done.has(inv.id));
    const openDeposits = () => state.deposits.filter((dep) => !state.done.has(dep.id));
    const currentDeposit = () => state.deposits.find((dep) => dep.id === state.selectedDeposit) || null;

    const subsets = (items) => {
      const out = [];
      const n = items.length;
      for (let mask = 1; mask < 1 << n; mask++) {
        const pick = items.filter((_, i) => mask & (1 << i));
        out.push(pick);
      }
      return out;
    };

    const suggest = (dep) => {
      if (!dep || dep.interest) return { known: false, pick: [] };
      const company = state.names[dep.name];
      const pool = company
        ? openInvoices().filter((inv) => inv.company === company)
        : openInvoices();
      const fits = subsets(pool.length > 8 ? pool.slice(0, 8) : pool)
        .map((pick) => ({ pick, diff: pick.reduce((s, inv) => s + inv.amount, 0) - dep.amount }))
        .filter(({ diff }) => diff >= 0 && diff <= FEE_LIMIT)
        .sort((a, b) => a.diff - b.diff || a.pick.length - b.pick.length);
      const best = fits[0]?.pick ?? [];
      return { known: Boolean(company), company, pick: best };
    };

    const announce = (text) => {
      els.status.textContent = "";
      window.setTimeout(() => {
        els.status.textContent = text;
      }, 30);
    };

    const stamp = (id) => {
      const s = document.createElement("span");
      s.className = "mini-stamp";
      if (state.fresh.has(id)) s.classList.add("is-new");
      s.textContent = "消込済";
      s.setAttribute("aria-hidden", "true");
      return s;
    };

    const renderTally = () => {
      const inv = openInvoices();
      setText(els.tallyDeposits, `${openDeposits().length}件`);
      setText(els.tallyInvoices, `${inv.length}件`);
      setText(els.tallyAmount, yen(inv.reduce((s, i) => s + i.amount, 0)));
    };

    const renderDeposits = () => {
      els.deposits.replaceChildren();
      for (const dep of state.deposits) {
        const li = document.createElement("li");
        const done = state.done.has(dep.id);
        if (done) li.classList.add("is-done");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "deposit";
        b.dataset.id = dep.id;
        b.setAttribute("aria-pressed", String(state.selectedDeposit === dep.id));
        b.disabled = done;
        const date = document.createElement("span");
        date.className = "deposit-date";
        date.textContent = `2026年${dep.date.replace("-", "月")}日の入金`;
        const name = document.createElement("span");
        name.className = "pb";
        name.textContent = dep.name;
        const amt = document.createElement("span");
        amt.className = "pb num";
        amt.textContent = comma(dep.amount);
        b.append(date, name, amt);
        if (done) {
          const hidden = document.createElement("span");
          hidden.className = "visually-hidden";
          hidden.textContent = "消込済";
          b.append(hidden, stamp(dep.id));
        }
        li.append(b);
        els.deposits.append(li);
      }
    };

    const renderInvoices = () => {
      const dep = currentDeposit();
      const hint = suggest(dep);
      const candidates = new Set(hint.pick.map((inv) => inv.id));
      els.invoices.replaceChildren();
      for (const inv of state.invoices) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        label.className = "invoice";
        const done = state.done.has(inv.id);
        if (done) label.classList.add("is-done");
        if (inv.late && !done) label.classList.add("is-late");
        if (!done && candidates.has(inv.id)) label.classList.add("is-candidate");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = inv.id;
        box.disabled = done || !dep || Boolean(dep?.interest);
        box.checked = state.checked.has(inv.id);
        const body = document.createElement("span");
        const name = document.createElement("span");
        name.className = "invoice-name";
        name.textContent = inv.company;
        const meta = document.createElement("span");
        meta.className = "invoice-meta";
        meta.textContent = `No. ${inv.id}　期日 ${inv.due}${inv.late && !done ? "（期日超過）" : ""}`;
        body.append(name, meta);
        if (!done && candidates.has(inv.id)) {
          const h = document.createElement("span");
          h.className = "invoice-hint";
          h.textContent = hint.known ? "名義と金額から候補" : "金額から候補";
          body.append(h);
        }
        const amt = document.createElement("span");
        amt.className = "invoice-amt num";
        amt.textContent = comma(inv.amount);
        label.append(box, body, amt);
        if (done) {
          const hidden = document.createElement("span");
          hidden.className = "visually-hidden";
          hidden.textContent = "消込済";
          label.append(hidden, stamp(inv.id));
        }
        li.append(label);
        els.invoices.append(li);
      }
    };

    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    const actionButton = (text, onClick, disabled = false) => {
      const b = el("button", "button", text);
      b.type = "button";
      b.disabled = disabled;
      b.addEventListener("click", onClick);
      return b;
    };

    const renderCheck = () => {
      const dep = currentDeposit();
      els.check.replaceChildren();
      if (openDeposits().length === 0) {
        const rest = openInvoices();
        els.check.append(el("p", null, "11月の入金はすべて照合しました。"));
        if (rest.length) {
          const names = rest.map((inv) => `${inv.company} ${yen(inv.amount)}（期日 ${inv.due}）`).join("、");
          els.check.append(el("p", "check-msg", `まだ入金のない請求書：${names}。期日を過ぎたものは、確認の連絡文の下書きを用意する想定です。`));
        }
        return;
      }
      if (!dep) {
        els.check.append(el("p", "check-empty", "入金明細から、一つ選んでください。"));
        return;
      }

      const head = el("p", null);
      head.append(el("span", "pb", dep.name));
      els.check.append(head);

      if (dep.interest) {
        els.check.append(el("p", "check-msg", "銀行の預金利息です。請求書とは関係がないので、受取利息として照合から外します。"));
        const actions = el("div", "check-actions");
        actions.append(actionButton("受取利息として外す", () => settle(dep, [], 0)));
        els.check.append(actions);
        return;
      }

      const hint = suggest(dep);
      const picked = state.invoices.filter((inv) => state.checked.has(inv.id));
      const total = picked.reduce((s, inv) => s + inv.amount, 0);
      const diff = total - dep.amount;

      const dl = el("dl", "check-sum");
      const row = (label, value, cls) => {
        const d = el("div", cls);
        d.append(el("dt", null, label), el("dd", "num", value));
        return d;
      };
      dl.append(row("入金", yen(dep.amount)));
      dl.append(row(`選んだ請求書（${picked.length}枚）`, yen(total)));
      dl.append(row("差額", picked.length ? yen(diff) : "—", `check-diff${picked.length && diff !== 0 ? " is-off" : ""}`));
      els.check.append(dl);

      if (!hint.known && hint.pick.length) {
        els.check.append(el("p", "check-msg", `この名義はまだ取引先と結ばれていません。金額が合う「${hint.pick[0].company}」の請求書を候補にしました。消込むと、次からこの名義を${hint.pick[0].company}として扱います。`));
      } else if (hint.pick.length > 1) {
        els.check.append(el("p", "check-msg", `同じ取引先の請求書${hint.pick.length}枚の合計が、入金額と一致します。`));
      } else if (hint.known && hint.pick.length === 1 && hint.pick[0].amount !== dep.amount) {
        els.check.append(el("p", "check-msg", `名義は${hint.company}です。差額${yen(hint.pick[0].amount - dep.amount)}は、振込手数料を引かれた可能性があります。`));
      }

      const actions = el("div", "check-actions");
      if (!picked.length) {
        if (hint.pick.length) {
          actions.append(actionButton("候補の請求書を選ぶ", () => {
            state.checked = new Set(hint.pick.map((inv) => inv.id));
            render();
            announce(`候補の請求書を${hint.pick.length}枚選びました。`);
            els.check.querySelector(".button")?.focus();
          }));
        } else {
          els.check.append(el("p", "check-msg", "金額の合う請求書が見つかりません。請求書の一覧から選んでください。"));
        }
      } else if (diff === 0) {
        actions.append(actionButton("消込む", () => settle(dep, picked, 0)));
      } else if (diff > 0 && diff <= FEE_LIMIT) {
        actions.append(actionButton(`差額${yen(diff)}を手数料として消込む`, () => settle(dep, picked, diff)));
      } else if (diff < 0) {
        els.check.append(el("p", "check-msg is-warn", `入金のほうが${yen(-diff)}多くなっています。請求書を追加で選ぶか、前受金として扱うかを確かめてください。`));
        actions.append(actionButton("消込む", () => {}, true));
      } else {
        els.check.append(el("p", "check-msg is-warn", `差額${yen(diff)}は手数料の範囲（${yen(FEE_LIMIT)}まで）を超えています。一部だけの入金かどうか、取引先に確かめてください。`));
        actions.append(actionButton("消込む", () => {}, true));
      }
      if (actions.childElementCount) els.check.append(actions);
    };

    const journal = (dep, picked, fee) => {
      const date = dep.date.replace("-", "/");
      const lines = [];
      if (dep.interest) {
        lines.push(["普通預金", dep.amount, "受取利息", dep.amount, "預金利息"]);
      } else {
        const company = picked[0].company;
        const credit = picked.reduce((s, inv) => s + inv.amount, 0);
        lines.push(["普通預金", dep.amount, "売掛金", credit, `${company} ${picked.map((p) => p.id).join("・")}`]);
        if (fee) lines.push(["支払手数料", fee, "", "", "振込手数料（当方負担）"]);
      }
      els.journalTable.hidden = false;
      els.journalEmpty.hidden = true;
      lines.forEach((line, i) => {
        const tr = document.createElement("tr");
        if (i > 0) tr.className = "is-continued";
        const cells = [i === 0 ? date : "", line[0], line[1] === "" ? "" : comma(line[1]), line[2], line[3] === "" ? "" : comma(line[3]), line[4]];
        cells.forEach((value, c) => {
          const td = document.createElement("td");
          if (c === 2 || c === 4) td.className = "num";
          td.textContent = value;
          tr.append(td);
        });
        els.journalBody.append(tr);
      });
    };

    const settle = (dep, picked, fee) => {
      state.done.add(dep.id);
      state.fresh = new Set([dep.id, ...picked.map((inv) => inv.id)]);
      for (const inv of picked) state.done.add(inv.id);
      if (picked.length && !state.names[dep.name]) state.names[dep.name] = picked[0].company;
      journal(dep, picked, fee);
      state.selectedDeposit = null;
      state.checked = new Set();
      render();
      state.fresh = new Set();
      const msg = dep.interest
        ? "利息を受取利息として外しました。"
        : `${picked[0].company}の入金を消込みました。${fee ? `差額${yen(fee)}は支払手数料として仕訳案に入れました。` : ""}`;
      announce(msg);
      const next = els.deposits.querySelector(".deposit:not(:disabled)");
      (next || els.reset).focus();
    };

    const render = () => {
      renderTally();
      renderDeposits();
      renderInvoices();
      renderCheck();
    };

    els.deposits.addEventListener("click", (event) => {
      const b = event.target.closest(".deposit");
      if (!b || b.disabled) return;
      const id = b.dataset.id;
      state.selectedDeposit = state.selectedDeposit === id ? null : id;
      state.checked = new Set();
      render();
      els.deposits.querySelector(`[data-id="${id}"]`)?.focus();
      const dep = currentDeposit();
      if (dep) {
        if (narrow.matches) panel?.scrollIntoView({ block: "nearest", behavior: reduce.matches ? "auto" : "smooth" });
        const hint = suggest(dep);
        announce(dep.interest
          ? "利息の入金を選びました。"
          : hint.pick.length
            ? `${comma(dep.amount)}円の入金を選びました。候補の請求書が${hint.pick.length}枚あります。`
            : `${comma(dep.amount)}円の入金を選びました。`);
      }
    });

    els.invoices.addEventListener("change", (event) => {
      const box = event.target;
      if (!(box instanceof HTMLInputElement)) return;
      if (box.checked) state.checked.add(box.value);
      else state.checked.delete(box.value);
      const value = box.value;
      render();
      els.invoices.querySelector(`input[value="${value}"]`)?.focus();
    });

    els.reset.addEventListener("click", () => {
      state = fresh();
      els.journalBody.replaceChildren();
      els.journalTable.hidden = true;
      els.journalEmpty.hidden = false;
      render();
      announce("最初の状態に戻しました。");
    });

    state = fresh();
    render();
  }

  const PLANS = [
    { name: "ひとり経理", price: 2980, invoices: 30, users: 1 },
    { name: "ふたり経理", price: 5980, invoices: 150, users: 2 },
    { name: "請求の多い会社", price: 9800, invoices: 500, users: 3 },
  ];

  const form = document.getElementById("quote-form");
  if (form) {
    const company = document.getElementById("q-company");
    const count = document.getElementById("q-invoices");
    const users = document.getElementById("q-users");
    const to = document.getElementById("quote-to");
    const plan = document.getElementById("quote-plan");
    const sub = document.getElementById("q-sub");
    const tax = document.getElementById("q-tax");
    const total = document.getElementById("q-total");
    const rows = document.querySelectorAll(".plans tbody tr");

    const update = () => {
      const name = company.value.trim();
      setText(to, `${name || "貴社名"} 御中`);
      const n = Math.max(1, Math.floor(Number(count.value) || 0));
      const u = Number(users.value);
      const index = PLANS.findIndex((p) => n <= p.invoices && u <= p.users);
      rows.forEach((row) => row.classList.toggle("is-chosen", Number(row.dataset.plan) === index));
      if (index === -1) {
        setText(plan, "月500枚を超える場合の料金は決めていません。架空のサービスのため、この条件の見積もりは出せません。");
        setText(sub, "—");
        setText(tax, "—");
        setText(total, "—");
        return;
      }
      const p = PLANS[index];
      const t = Math.floor(p.price * 0.1);
      setText(plan, `月${comma(n)}枚・${u}人なら「${p.name}」になります。`);
      setText(sub, yen(p.price));
      setText(tax, yen(t));
      setText(total, yen(p.price + t));
    };

    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
  }
})();
