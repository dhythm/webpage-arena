import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";
import { readMeta, siteCoverage } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const rootFlag = process.argv.indexOf("--root");
const root = rootFlag === -1 ? repo : resolve(repo, process.argv[rootFlag + 1]);
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
  console.log(
    `Smoke: site count mismatch: ${coverage.expected} expected, ${coverage.sites.length} listed`,
  );
  process.exit(1);
}
const sites = coverage.sites;
const allowedOrigins = {};
for (const site of sites)
  allowedOrigins[site] = (await readMeta(root, site)).externalOrigins ?? [];
const server = createServer(async (req, res) => {
  try {
    let file = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`Smoke server: ${base} (root ${root})`);
async function smoke(browser, site, viewport) {
  const allowed = new Set([base, ...allowedOrigins[site]]);
  const problems = new Set();
  const blocked = new Set();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
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
  try {
    await page.goto(`${base}/${site}/`, { waitUntil: "networkidle" });
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
  } catch (error) {
    problems.add(`error: ${error.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
  return [...problems];
}
const counts = { passed: 0, failed: 0, skipped: 0 };
const browser = await chromium.launch();
try {
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
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
const total = counts.passed + counts.failed + counts.skipped;
const expectedCases = coverage.expected * viewports.length;
console.log(
  `Smoke: ${total} cases (${sites.length} sites x ${viewports.length} widths): ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
);
console.log(
  `Smoke: ${coverage.expected} sites expected (folders with index.html or meta.json), ${sites.length} smoked, ${total}/${expectedCases} cases`,
);
process.exit(
  total > 0 && total === expectedCases && counts.failed === 0 ? 0 : 1,
);
