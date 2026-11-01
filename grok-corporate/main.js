(function () {
  var root = document.documentElement;
  if (root.dataset.shiokeiReady === "1") return;
  root.dataset.shiokeiReady = "1";

  var toggle = document.getElementById("nav-toggle");
  var button = document.querySelector(".nav-js");
  var nav = document.getElementById("site-nav");
  if (toggle && button && nav) {
    var mobileQuery = window.matchMedia("(max-width: 879px)");
    root.classList.add("nav-ready");
    toggle.setAttribute("aria-hidden", "true");
    toggle.tabIndex = -1;
    function sync() {
      button.setAttribute("aria-expanded", toggle.checked ? "true" : "false");
    }
    function closeMenu(restoreFocus) {
      if (!toggle.checked) return;
      toggle.checked = false;
      sync();
      if (restoreFocus) button.focus({ preventScroll: true });
    }
    button.addEventListener("click", function () {
      toggle.checked = !toggle.checked;
      sync();
    });
    nav.addEventListener("click", function (event) {
      if (!mobileQuery.matches) return;
      if (!event.target.closest("a")) return;
      var link = event.target.closest("a");
      var target = document.querySelector(link.getAttribute("href"));
      event.preventDefault();
      closeMenu(false);
      if (target) target.scrollIntoView();
      button.focus({ preventScroll: true });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !mobileQuery.matches) return;
      closeMenu(true);
    });
    sync();
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;
  var nodes = document.querySelectorAll("[data-rise]");
  if (!nodes.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.16 });
  Array.prototype.forEach.call(nodes, function (el) {
    io.observe(el);
  });
})();
