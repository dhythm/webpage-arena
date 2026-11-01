import { cp, mkdir, rm, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const sites = [
  "gpt-nagi",
  "gpt-umi",
  "grok-lp",
  "grok-corporate",
  "gemini-lp",
  "gemini-corporate",
  "devin-meguru",
  "devin-tsumugiya",
  "claude-lp",
  "claude-corporate",
];
await rm(join(root, "dist"), { recursive: true, force: true });
await mkdir(join(root, "dist"), { recursive: true });
for (const site of sites) {
  const path = join(root, site);
  await cp(path, join(root, "dist", site), { recursive: true });
  const html = await readFile(join(path, "index.html"), "utf8");
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(?:https?:|mailto:|data:)/.test(reference)) continue;
    await stat(resolve(path, reference.split("#")[0]));
  }
  console.log(`Built ${site} (local references verified)`);
}
await cp(join(root, "index.html"), join(root, "dist", "index.html"));
