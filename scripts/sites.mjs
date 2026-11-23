import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
const excluded = new Set(["node_modules", "dist", "qa", "scripts"]);
export async function listSites(root) {
  const sites = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || excluded.has(entry.name)) continue;
    const index = await stat(join(root, entry.name, "index.html")).catch(
      () => null,
    );
    if (index?.isFile()) sites.push(entry.name);
  }
  return sites.sort();
}
