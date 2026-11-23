import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
const excluded = new Set(["node_modules", "dist", "qa", "scripts"]);
async function isFile(path) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
export async function listFolders(root) {
  const folders = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || excluded.has(entry.name)) continue;
    const index = await isFile(join(root, entry.name, "index.html"));
    const meta = await isFile(join(root, entry.name, "meta.json"));
    if (index || meta) folders.push({ name: entry.name, index, meta });
  }
  return folders.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
export async function listSites(root) {
  return (await listFolders(root))
    .filter((folder) => folder.meta)
    .map((folder) => folder.name);
}
export async function siteCoverage(root) {
  const folders = await listFolders(root);
  const problems = [];
  for (const folder of folders) {
    if (!folder.meta) problems.push(`${folder.name}: index.html without meta.json`);
    if (!folder.index) problems.push(`${folder.name}: meta.json without index.html`);
  }
  return {
    expected: folders.length,
    sites: folders.filter((folder) => folder.meta).map((folder) => folder.name),
    problems,
  };
}
export async function readMeta(root, site) {
  return JSON.parse(await readFile(join(root, site, "meta.json"), "utf8"));
}
