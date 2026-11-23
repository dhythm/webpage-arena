import { cp, mkdir, rm, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { siteCoverage } from "./sites.mjs";
const root = resolve(import.meta.dirname, "..");
const coverage = await siteCoverage(root);
if (coverage.problems.length > 0 || coverage.sites.length !== coverage.expected) {
  for (const problem of coverage.problems) console.error(`FAIL ${problem}`);
  console.error(
    `Build: site count mismatch: ${coverage.expected} expected, ${coverage.sites.length} listed`,
  );
  process.exit(1);
}
const sites = coverage.sites;
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
console.log(`Built ${sites.length} sites`);
