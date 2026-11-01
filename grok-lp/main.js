(function () {
  var root = document.documentElement;
  if (root.dataset.ready === "1") return;
  root.dataset.ready = "1";
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
