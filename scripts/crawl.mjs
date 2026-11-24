import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { renderRequest } from "./catalog.mjs";
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
export function fileServer(dir, prefix, dynamic) {
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
export async function listen(server) {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${server.address().port}`;
}
export async function close(server) {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
export async function htmlFiles(dir) {
  const entries = await readdir(dir, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith(".html"))
    .map((entry) => entry.split(sep).join("/"))
    .sort();
}
const decode = (value) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
export function references(html) {
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2")
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, "$1$2");
  return [...markup.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map((match) => decode((match[1] ?? match[2]).trim()))
    .filter((ref) => ref !== "" && !ref.startsWith("#") && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref));
}
export async function crawl(origin, prefix, seeds) {
  const root = new URL(prefix, origin).href;
  const from = new Map();
  const queue = [];
  const add = (url, page) => {
    if (from.has(url)) return;
    from.set(url, page);
    queue.push(url);
  };
  for (const seed of seeds) add(new URL(seed, root).href, "(seed)");
  const pages = [];
  const broken = [];
  while (queue.length) {
    const url = queue.shift();
    if (!url.startsWith(root)) {
      broken.push({ url, status: "outside", from: from.get(url) });
      continue;
    }
    const response = await fetch(url);
    if (response.status !== 200) {
      await response.arrayBuffer();
      broken.push({ url, status: response.status, from: from.get(url) });
      continue;
    }
    if (!(response.headers.get("content-type") ?? "").startsWith("text/html")) {
      await response.arrayBuffer();
      continue;
    }
    pages.push(url);
    for (const ref of references(await response.text())) {
      const target = new URL(ref, url);
      target.hash = "";
      add(target.href, url);
    }
  }
  return { pages, links: from.size, broken };
}

export async function missingRefs(dir, prefix = "/webpage-arena/") {
  const pages = await htmlFiles(dir);
  const missing = [];
  let links = 0;
  for (const page of pages) {
    const html = await readFile(resolve(dir, page), "utf8");
    const base = new URL(page, `https://example.test${prefix}`);
    for (const ref of references(html)) {
      links++;
      const target = new URL(ref, base);
      const path = target.pathname;
      if (!path.startsWith(prefix)) {
        missing.push({ from: page, ref, reason: "outside" });
        continue;
      }
      let file = resolve(dir, path.slice(prefix.length));
      if (file !== dir && !file.startsWith(dir + sep)) {
        missing.push({ from: page, ref, reason: "escape" });
        continue;
      }
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory()) file = resolve(file, "index.html");
      if (!(await stat(file).catch(() => null))) missing.push({ from: page, ref, reason: "missing" });
    }
  }
  return { pages, links, missing };
}
