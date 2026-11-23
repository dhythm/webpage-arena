import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(
  /\/+$/,
  "",
);
const targets = [
  { site: "hub", path: "/", states: ["page"] },
  { site: "gpt-nagi", path: "/gpt-nagi/", states: ["page", "dialog"], dialog: ".header [data-reserve]" },
  { site: "gpt-umi", path: "/gpt-umi/", states: ["page", "dialog"], dialog: ".header-contact" },
];
const browser = await chromium.launch();
const report = [];
try {
  for (const { site, path, states, dialog } of targets)
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(`${baseUrl}${path}`, {
        waitUntil: "networkidle",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      for (const state of states) {
        if (state === "dialog") await page.locator(dialog).click();
        const result = await page.evaluate(() =>
          axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          }),
        );
        const violations = result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        }));
        report.push({
          site,
          width,
          state,
          violations,
          passes: result.passes.length,
          incomplete: result.incomplete.length,
        });
        console.log(JSON.stringify({ site, width, state, violations }));
      }
      await page.close();
    }
} finally {
  await browser.close();
  await mkdir(new URL("../qa/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../qa/accessibility.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(
  `Accessibility: ${report.length} checks (${targets.map((t) => t.site).join(", ")}), ${report.filter((r) => r.violations.length).length} with violations`,
);
assert.ok(
  report.every((r) => r.violations.length === 0),
  "Accessibility violations found; see qa/accessibility.json",
);
