import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { coverageSummary, readMeta, siteCoverage } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const viewport = { width: 1280, height: 800 };
const output = { width: 640, height: 400 };
const quality = 75;
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
export function parseArgs(argv) {
  const args = { ids: [], all: false, root: "." };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--all") args.all = true;
    else if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i].startsWith("-")) throw new Error(`unknown option: ${argv[i]}`);
    else args.ids.push(argv[i]);
  }
  return args;
}
export function selectTargets(sites, existing, { ids, all }) {
  for (const id of ids) if (!sites.includes(id)) throw new Error(`unknown site: ${id}`);
  if (all) return [...sites];
  if (ids.length) return sites.filter((site) => ids.includes(site));
  return sites.filter((site) => !existing.has(site));
}
export function webpSize(data) {
  if (
    data.length < 20 ||
    data.toString("latin1", 0, 4) !== "RIFF" ||
    data.toString("latin1", 8, 12) !== "WEBP"
  )
    throw new Error("not a RIFF/WEBP file");
  const chunk = data.toString("latin1", 12, 16);
  if (chunk === "VP8 ") {
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a)
      throw new Error("bad VP8 start code");
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (data[20] !== 0x2f) throw new Error("bad VP8L signature");
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X")
    return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
  throw new Error(`unknown WebP chunk "${chunk}"`);
}
async function isFile(path) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
function serve(root) {
  return createServer(async (req, res) => {
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
}
async function capture(browser, base, site, meta) {
  const allowed = new Set([base, ...(meta.externalOrigins ?? [])]);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "data:" || url.protocol === "blob:" || allowed.has(url.origin))
        return route.continue();
      return route.abort();
    });
    await page.goto(`${base}/${site}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (meta.thumbWait) await page.waitForSelector(meta.thumbWait, { state: "visible" });
    await page.waitForLoadState("networkidle");
    const png = await page.screenshot({ type: "png" });
    const resize = await context.newPage();
    await resize.setViewportSize(output);
    await resize.setContent(
      `<style>html,body{margin:0}canvas{display:block}</style><canvas width="${output.width}" height="${output.height}"></canvas>`,
    );
    await resize.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.querySelector("canvas");
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }, `data:image/png;base64,${png.toString("base64")}`);
    return await resize.screenshot({ type: "webp", quality });
  } finally {
    await context.close();
  }
}
async function main(argv) {
  const args = parseArgs(argv);
  const root = resolve(repo, args.root);
  const coverage = await siteCoverage(root);
  if (coverage.problems.length > 0 || coverage.sites.length !== coverage.expected) {
    for (const problem of coverage.problems) console.log(`FAIL ${problem}`);
    for (const line of coverageSummary("Thumbs", coverage)) console.log(line);
    return 1;
  }
  const existing = new Set();
  for (const site of coverage.sites)
    if (await isFile(join(root, site, "thumb.webp"))) existing.add(site);
  const targets = selectTargets(coverage.sites, existing, args);
  const reason =
    args.all || args.ids.length ? "not selected" : "already have thumb.webp";
  const skipped = coverage.sites.length - targets.length;
  let generated = 0;
  if (targets.length > 0) {
    const { chromium } = await import("playwright");
    const server = serve(root);
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${server.address().port}`;
    console.log(`Thumbs server: ${base} (root ${root})`);
    const browser = await chromium.launch();
    try {
      for (const site of targets) {
        const data = await capture(browser, base, site, await readMeta(root, site));
        const size = webpSize(data);
        await writeFile(join(root, site, "thumb.webp"), data);
        generated++;
        console.log(
          `Thumb ${site}/thumb.webp ${size.width}x${size.height} ${data.length} bytes${existing.has(site) ? " (overwritten)" : ""}`,
        );
      }
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
  console.log(`Thumbs: generated ${generated}, skipped ${skipped} (${reason})`);
  return 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(await main(process.argv.slice(2)));
