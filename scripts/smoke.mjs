import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildDist, renderRequest } from "./catalog.mjs";
import { coverageSummary, readMeta, siteCoverage } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const rootFlag = process.argv.indexOf("--root");
const root = rootFlag === -1 ? repo : resolve(repo, process.argv[rootFlag + 1]);
const withHub = root === repo;
const subpath = "/webpage-arena/";
const viewports = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
];
const KNOWN_FAILURES = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const coverage = await siteCoverage(root);
if (coverage.problems.length > 0 || coverage.sites.length !== coverage.expected) {
  for (const problem of coverage.problems) console.log(`FAIL ${problem}`);
  for (const line of coverageSummary("Smoke", coverage)) console.log(line);
  process.exit(1);
}
const sites = coverage.sites;
const allowedOrigins = {};
const metas = [];
for (const site of sites) {
  const meta = await readMeta(root, site);
  metas.push(meta);
  allowedOrigins[site] = meta.externalOrigins ?? [];
}
function fileServer(dir, prefix, dynamic) {
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (!pathname.startsWith(prefix)) throw new Error("outside prefix");
      const local = "/" + pathname.slice(prefix.length);
      const page = dynamic ? await renderRequest(dir, local) : null;
      if (page) {
        res.writeHead(200, { "Content-Type": page.type, "Cache-Control": "no-cache" });
        res.end(page.body);
        return;
      }
      let file = resolve(dir, "." + local);
      if (file !== dir && !file.startsWith(dir + sep)) {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
  });
}
async function listen(server) {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
const server = fileServer(root, "/", withHub);
const base = await listen(server);
console.log(`Smoke server: ${base} (root ${root})`);
async function watch(page, allowed, problems) {
  const blocked = new Set();
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:")
      return route.continue();
    if (request.method() !== "GET") {
      problems.add(`method: ${request.method()} ${request.url()}`);
      blocked.add(request);
      return route.abort();
    }
    if (!allowed.has(url.origin)) {
      problems.add(`external: ${request.url()}`);
      blocked.add(request);
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", (error) => problems.add(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.add(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      problems.add(`status: ${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    if (!blocked.has(request))
      problems.add(
        `requestfailed: ${request.failure()?.errorText} ${request.url()}`,
      );
  });
}
async function visit(page, url, problems) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
      window.scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  const size = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (size.scrollWidth > size.width)
    problems.add(`overflow: scrollWidth ${size.scrollWidth} > ${size.width}`);
}
async function smoke(browser, site, viewport) {
  const problems = new Set();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await watch(page, new Set([base, ...allowedOrigins[site]]), problems);
  try {
    await visit(page, `${base}/${site}/`, problems);
  } catch (error) {
    problems.add(`error: ${error.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
  return [...problems];
}
const dimensions = {
  prompt: (meta) => meta.promptPath ?? `type:${meta.type}`,
  type: (meta) => meta.type,
  model: (meta) => meta.model,
  tool: (meta) => meta.tool,
};
const matching = (selection) =>
  metas.filter((meta) =>
    Object.entries(selection).every(([name, value]) => dimensions[name](meta) === value),
  ).length;
const visibleCards = (page) =>
  page.evaluate(
    () => [...document.querySelectorAll("[data-card]")].filter((card) => card.checkVisibility()).length,
  );
const countText = (page) => page.evaluate(() => document.querySelector("[data-count]").textContent.trim());
async function choose(page, selection) {
  for (const name of Object.keys(dimensions))
    await page.selectOption(`select[name="${name}"]`, selection[name] ?? "");
}
async function checkFilters(page, problems) {
  if (!(await page.locator("form[data-filters]").isVisible())) {
    problems.add("filter: form[data-filters] is not visible");
    return;
  }
  for (const [name, key] of Object.entries(dimensions)) {
    const expected = [...new Set(metas.map(key))].sort();
    const options = (
      await page.$$eval(`select[name="${name}"] option`, (list) => list.map((o) => o.value))
    )
      .filter(Boolean)
      .sort();
    if (JSON.stringify(options) !== JSON.stringify(expected))
      problems.add(`filter: ${name} options ${options.join("|")} != meta ${expected.join("|")}`);
    for (const value of expected) {
      await choose(page, { [name]: value });
      const shown = await visibleCards(page);
      const want = matching({ [name]: value });
      if (shown !== want) problems.add(`filter: ${name}=${value} shows ${shown}, meta has ${want}`);
      const status = await countText(page);
      if (status !== `${metas.length} 作品中 ${want} 作品を表示`)
        problems.add(`filter: ${name}=${value} count reads "${status}"`);
    }
  }
  const first = metas[0];
  const pair = { type: first.type, model: first.model };
  await choose(page, pair);
  if ((await visibleCards(page)) !== matching(pair))
    problems.add(`filter: type+model AND shows ${await visibleCards(page)}, meta has ${matching(pair)}`);
  if (await page.locator("[data-empty]").isVisible())
    problems.add("filter: no-match message visible while cards match");
  let empty = null;
  const names = Object.keys(dimensions);
  for (const a of names)
    for (const b of names)
      for (const x of new Set(metas.map(dimensions[a])))
        for (const y of new Set(metas.map(dimensions[b])))
          if (!empty && a < b && matching({ [a]: x, [b]: y }) === 0) empty = { [a]: x, [b]: y };
  if (empty) {
    await choose(page, empty);
    if ((await visibleCards(page)) !== 0)
      problems.add(`filter: ${JSON.stringify(empty)} should show 0 cards`);
    const message = page.locator("[data-empty]");
    if (!(await message.isVisible()) || !/条件に合う作品はありません/.test(await message.innerText()))
      problems.add(`filter: no-match message not shown for ${JSON.stringify(empty)}`);
  } else console.log("NOTE hub filter: every pair of options matches a site; no-match message checked by catalog.test.mjs");
  await choose(page, {});
  if ((await visibleCards(page)) !== metas.length)
    problems.add(`filter: reset shows ${await visibleCards(page)} of ${metas.length}`);
  if ((await countText(page)) !== "")
    problems.add(`filter: count without filters reads "${await countText(page)}"`);
  await page.evaluate(() => document.activeElement?.blur());
  let focused = null;
  for (let i = 0; i < 40 && focused !== "prompt"; i++) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => document.activeElement?.getAttribute("name"));
  }
  if (focused !== "prompt") problems.add("filter: select[name=prompt] not reachable with Tab");
  else {
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    if (outline === "none") problems.add("filter: no :focus-visible outline on the prompt select");
  }
}
async function hub(browser, viewport) {
  const problems = new Set();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await watch(page, new Set([base]), problems);
  try {
    await visit(page, `${base}/`, problems);
    const cards = await page.locator("[data-card]").count();
    if (cards !== metas.length) problems.add(`cards: ${cards} cards, ${metas.length} sites in meta`);
    if (viewport.width >= 1280) await checkFilters(page, problems);
  } catch (error) {
    problems.add(`error: ${error.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
  return [...problems];
}
async function hubSubpath(browser) {
  const problems = new Set();
  const out = await mkdtemp(join(tmpdir(), "webpage-arena-dist-"));
  const dist = fileServer(out, subpath, false);
  try {
    await buildDist(root, out);
    const origin = await listen(dist);
    const url = `${origin}${subpath}`;
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ viewport: viewports[1], javaScriptEnabled });
      const page = await context.newPage();
      await watch(page, new Set([origin]), problems);
      try {
        if (javaScriptEnabled) await visit(page, url, problems);
        else await page.goto(url, { waitUntil: "load" });
        const cards = await page.locator("[data-card]").count();
        const label = javaScriptEnabled ? "js" : "no-js";
        if (cards !== metas.length)
          problems.add(`subpath ${label}: ${cards} cards, ${metas.length} sites in meta`);
        if (!javaScriptEnabled) continue;
        const links = await page.$$eval("[data-card] a[href], [data-card] img", (list) =>
          list.map((el) => (el.tagName === "IMG" ? el.currentSrc || el.src : el.href)),
        );
        const unique = [...new Set(links)];
        if (unique.length < metas.length * 2)
          problems.add(`subpath: only ${unique.length} card links and thumbs found`);
        let broken = 0;
        for (const link of unique) {
          const status = link.startsWith(url) ? (await fetch(link)).status : "outside";
          if (status !== 200) {
            broken++;
            problems.add(`subpath: ${status} ${link}`);
          }
        }
        console.log(`Hub subpath: ${cards} cards, ${unique.length} card links and thumbs, ${broken} broken`);
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    problems.add(`error: ${error.message.split("\n")[0]}`);
  } finally {
    if (dist.listening) await close(dist);
    await rm(out, { recursive: true, force: true });
  }
  return [...problems];
}
async function checkSevenRow(browser) {
  const problems = new Set();
  const root = await mkdtemp(join(tmpdir(), "catalog-seven-root-"));
  const out = await mkdtemp(join(tmpdir(), "catalog-seven-dist-"));
  try {
    await cp(join(repo, "tests/fixtures/catalog-basic"), root, { recursive: true });
    const meta = JSON.parse(await readFile(join(root, "grok-lamp", "meta.json"), "utf8"));
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const id = `lamp-${n}`;
      await cp(join(root, "grok-lamp"), join(root, id), { recursive: true });
      await writeFile(join(root, id, "meta.json"), JSON.stringify({ ...meta, id, title: `灯り ${n}` }));
    }
    await buildDist(root, out);
    const html = await readFile(join(out, "index.html"), "utf8");
    const group = html.match(/<section\b[^>]*\bdata-group="type:product-lp"[^>]*>([\s\S]*?)<\/section>/);
    const ids = group ? [...group[1].matchAll(/\bdata-id="([^"]+)"/g)].map((m) => m[1]) : [];
    if (ids.length < 7) problems.add(`seven: product-lp row has ${ids.length} cards`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(pathToFileURL(join(out, "index.html")).href);
      const ul = page.locator('[data-group="type:product-lp"] ul.row');
      const box = await ul.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cards = [...el.querySelectorAll("[data-card]")].map((c) => c.getBoundingClientRect());
        return {
          right: r.right,
          width: el.clientWidth,
          scroll: el.scrollWidth,
          snap: getComputedStyle(el).scrollSnapType,
          align: getComputedStyle(el.querySelector("[data-card]")).scrollSnapAlign,
          cards: cards.map((c) => ({ left: c.left, right: c.right, width: c.width })),
        };
      });
      if (!(box.scroll > box.width)) problems.add(`seven: row does not overflow ${box.scroll} <= ${box.width}`);
      const full = box.cards.filter((c) => c.right <= box.right + 0.5).length;
      const peek = box.cards.find((c) => c.left < box.right && c.right > box.right + 0.5);
      if (full !== 6) problems.add(`seven: ${full} fully visible cards, want 6`);
      if (!peek) problems.add("seven: the 7th card does not peek past the right edge");
      else {
        const visible = (box.right - peek.left) / peek.width;
        if (!(visible > 0.25 && visible < 0.75))
          problems.add(`seven: 7th card shows ${visible.toFixed(2)} of its width`);
      }
      if (!/x mandatory/.test(box.snap)) problems.add(`seven: snap is ${box.snap}`);
      if (box.align !== "start") problems.add(`seven: snap-align is ${box.align}`);
      await ul.focus();
      const label = await page.evaluate(() => document.activeElement.getAttribute("aria-label"));
      if (label !== "商品LPの作品、横にスクロール") problems.add(`seven: aria-label is "${label}"`);
      if ((await ul.evaluate((el) => getComputedStyle(el).outlineStyle)) === "none")
        problems.add("seven: no focus outline on the row");
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction((el) => el.scrollLeft > 0, await ul.elementHandle(), { timeout: 3000 });
      await ul.evaluate((el) => el.scrollTo({ left: 37, behavior: "instant" }));
      await page.waitForTimeout(500);
      const stop = await ul.evaluate((el) => {
        const start = el.getBoundingClientRect().left;
        return [...el.querySelectorAll("[data-card]")].map((c) =>
          Math.round(c.getBoundingClientRect().left - start),
        );
      });
      if (!stop.some((x) => Math.abs(x) <= 1))
        problems.add(`seven: no card edge at the row start after scrolling: ${stop}`);
      const count = page.locator("[data-count]");
      if ((await count.innerText()).trim() !== "") problems.add("seven: filter count should start empty");
      const want = ids.length;
      await page.selectOption("select[name=type]", "product-lp");
      const status = (await count.innerText()).trim();
      const listed = (await page.locator("[data-card]").count());
      const expect = `${listed} 作品中 ${want} 作品を表示`;
      if (status !== expect) problems.add(`seven: count reads "${status}", want "${expect}"`);
      await page.click("button[type=reset]");
      await page.waitForFunction(() => document.querySelector("[data-count]").textContent === "");
      await page.setViewportSize({ width: 375, height: 812 });
      const phone = await ul.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [...el.querySelectorAll("[data-card]")]
          .map((c) => c.getBoundingClientRect())
          .filter((c) => c.left < r.right && c.right > r.right).length;
      });
      if (phone !== 1) problems.add(`seven: at 375px ${phone} cards peek, want 1`);
    } finally {
      await page.close();
    }
  } catch (error) {
    problems.add(`seven: ${error.message.split("\n")[0]}`);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
  return [...problems];
}
const counts = { passed: 0, failed: 0, skipped: 0 };
const hubCounts = { passed: 0, failed: 0 };
const browser = await chromium.launch();
try {
  if (withHub) {
    const checks = [
      ...viewports.map((viewport) => [`hub ${viewport.width}px`, () => hub(browser, viewport)]),
      [`hub subpath ${subpath}`, () => hubSubpath(browser)],
      ["hub 7-card row peek", () => checkSevenRow(browser)],
    ];
    for (const [label, run] of checks) {
      const problems = await run();
      if (problems.length === 0) {
        hubCounts.passed++;
        console.log(`PASS ${label}`);
      } else {
        hubCounts.failed++;
        for (const problem of problems) console.log(`FAIL ${label} ${problem}`);
      }
    }
  }
  for (const site of sites)
    for (const viewport of viewports) {
      const label = `${site} ${viewport.width}px`;
      const known = KNOWN_FAILURES[site];
      if (known?.widths.includes(viewport.width)) {
        counts.skipped++;
        console.log(`SKIP ${label}: ${known.reason} (${known.size})`);
        continue;
      }
      const problems = await smoke(browser, site, viewport);
      if (problems.length === 0) {
        counts.passed++;
        console.log(`PASS ${label}`);
      } else {
        counts.failed++;
        for (const problem of problems) console.log(`FAIL ${label} ${problem}`);
      }
    }
} finally {
  await browser.close();
  await close(server);
}
const total = counts.passed + counts.failed + counts.skipped;
const expectedCases = coverage.expected * viewports.length;
console.log(
  `Smoke: ${total} cases (${sites.length} sites x ${viewports.length} widths): ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
);
console.log(
  `Smoke: ${coverage.expected} sites expected (folders with index.html or meta.json), ${sites.length} smoked, ${total}/${expectedCases} cases`,
);
if (withHub)
  console.log(
    `Hub: ${hubCounts.passed + hubCounts.failed} checks (${viewports.map((v) => `${v.width}px`).join(", ")}, subpath ${subpath}, 7-card row): ${hubCounts.passed} passed, ${hubCounts.failed} failed`,
  );
process.exit(
  total > 0 && total === expectedCases && counts.failed === 0 && hubCounts.failed === 0 ? 0 : 1,
);
