(() => {
  const yen = (n) => `${n.toLocaleString("ja-JP")}円`;

  const plan = document.querySelector(".plan");
  const planList = plan.querySelector(".plan-list");
  const planEmpty = plan.querySelector(".plan-empty");

  const renderPlan = () => {
    const marked = [...document.querySelectorAll(".act.is-marked")]
      .map((act) => ({
        time: act.querySelector("time").textContent,
        name: act.querySelector(".act-name").textContent,
        stage: act.closest(".stage").querySelector("h3").firstChild.textContent.trim(),
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
    planList.replaceChildren(
      ...marked.map((item) => {
        const li = document.createElement("li");
        const time = document.createElement("time");
        time.textContent = item.time;
        const body = document.createElement("div");
        const name = document.createElement("p");
        name.textContent = item.name;
        const stage = document.createElement("p");
        stage.className = "plan-stage";
        stage.textContent = item.stage;
        body.append(name, stage);
        li.append(time, body);
        return li;
      }),
    );
    planList.hidden = marked.length === 0;
    planEmpty.hidden = marked.length > 0;
  };

  document.querySelectorAll(".act .mark").forEach((button) => {
    button.addEventListener("click", () => {
      const act = button.closest(".act");
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "印をつけた" : "印をつける";
      act.classList.toggle("is-marked", on);
      renderPlan();
    });
  });

  const filters = document.querySelectorAll(".filter");
  const vendors = document.querySelectorAll(".vendor-list li");
  const zones = document.querySelectorAll(".pier-zone");
  const vendorCount = document.querySelector(".vendor-count");

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      const pick = button.dataset.filter;
      filters.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      let shown = 0;
      vendors.forEach((li) => {
        const visible = pick === "all" || li.dataset.cat === pick;
        li.hidden = !visible;
        if (visible) shown += 1;
      });
      zones.forEach((zone) => {
        zone.classList.toggle("is-dim", pick !== "all" && zone.dataset.cat !== pick);
      });
      vendorCount.textContent = `${shown}店を表示しています。`;
    });
  });

  const form = document.getElementById("ticket-form");
  const total = document.getElementById("ticket-total");
  const count = document.getElementById("ticket-count");
  const placeholder = document.querySelector(".stub-placeholder");
  const stub = document.querySelector(".stub");

  const current = () => {
    const kind = form.querySelector('input[name="kind"]:checked');
    const label = kind.closest(".choice").querySelector(".choice-name").textContent;
    const qty = Number(count.value);
    return { label, qty, sum: Number(kind.dataset.price) * qty };
  };

  const updateTotal = () => {
    total.textContent = yen(current().sum);
  };

  form.addEventListener("change", updateTotal);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { label, qty, sum } = current();
    stub.querySelector(".stub-kind").textContent = label;
    stub.querySelector(".stub-count").textContent = `${qty}枚`;
    stub.querySelector(".stub-total").textContent = `${yen(sum)}（支払いは発生しません）`;
    placeholder.hidden = true;
    stub.hidden = false;
    stub.classList.remove("is-new");
    void stub.offsetWidth;
    stub.classList.add("is-new");
  });

  updateTotal();
})();
