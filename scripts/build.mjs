import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildDist } from "./catalog.mjs";
import { coverageSummary, siteCoverage } from "./sites.mjs";
const root = resolve(import.meta.dirname, "..");
const coverage = await siteCoverage(root);
if (coverage.problems.length > 0 || coverage.sites.length !== coverage.expected) {
  for (const problem of coverage.problems) console.error(`FAIL ${problem}`);
  for (const line of coverageSummary("Build", coverage)) console.error(line);
  process.exit(1);
}
const dist = join(root, "dist");
const { sites, prompts } = await buildDist(root, dist);
for (const site of sites) {
  const path = join(dist, site);
  const html = await readFile(join(path, "index.html"), "utf8");
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(?:https?:|mailto:|data:)/.test(reference)) continue;
    await stat(resolve(path, reference.split("#")[0]));
  }
  console.log(`Built ${site} (local references verified)`);
}
const hub = await readFile(join(dist, "index.html"), "utf8");
const cards = hub.match(/<li\b[^>]*\bdata-card\b/g)?.length ?? 0;
for (const [, reference] of hub.matchAll(/(?:src|href)="([^"#]+)"/g))
  await stat(resolve(dist, reference));
console.log(`Built gallery: ${cards} cards baked into dist/index.html (local references verified)`);
console.log(`Built ${prompts.length} prompt pages in dist/prompts/`);
console.log(`Built ${sites.length} sites`);
if (cards !== sites.length) {
  console.error(`FAIL gallery has ${cards} cards for ${sites.length} sites`);
  process.exit(1);
}
