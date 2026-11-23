import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listFolders, listSites, readMeta } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const fixture = (name) => resolve(repo, "tests/fixtures", name);
const templateRule = "実行時に AI・API キー・有料サービスを使わない。";
const fixedSections = {
  "saas-lp": ["problem", "product", "features", "pricing", "faq", "demo"],
  restaurant: ["menu", "seats", "hours", "access", "reserve"],
  "app-lp": ["how", "screens", "privacy", "platforms", "download"],
  event: ["overview", "timetable", "vendors", "access", "notes", "tickets"],
  inn: ["rooms", "meals", "around", "pricing", "reserve"],
};
const looseTypes = ["product-lp", "corporate-hp"];
async function siteTypes() {
  return JSON.parse(await readFile(join(repo, "site-types.json"), "utf8")).map(
    (type) => type.id,
  );
}
function requiredSections(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!front) return null;
  const line = /^requiredSections:\s*\[(.*)\]\s*$/m.exec(front[1]);
  if (!line) return null;
  return line[1]
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
async function promptSections(promptRoot, promptPath) {
  return requiredSections(await readFile(join(promptRoot, promptPath), "utf8"));
}
function htmlIds(html) {
  return new Set(
    [...html.matchAll(/(?<![\w-])id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)].map(
      (match) => match[1] ?? match[2] ?? match[3],
    ),
  );
}
async function sectionGaps(siteRoot, promptRoot = repo) {
  const checked = [];
  const errors = [];
  for (const site of await listSites(siteRoot)) {
    const meta = await readMeta(siteRoot, site);
    if (meta.legacy !== false || typeof meta.promptPath !== "string") continue;
    checked.push(site);
    const sections = await promptSections(promptRoot, meta.promptPath).catch(() => null);
    if (sections === null) {
      errors.push(`${site}: ${meta.promptPath} has no requiredSections`);
      continue;
    }
    const ids = htmlIds(await readFile(join(siteRoot, site, "index.html"), "utf8"));
    for (const id of sections)
      if (!ids.has(id))
        errors.push(`${site}: missing id="${id}" required by ${meta.promptPath}`);
  }
  return { checked, errors };
}

test("prompts: every type in site-types.json has prompts/<type>.md", async () => {
  const types = await siteTypes();
  assert.equal(types.length, 7);
  for (const type of types)
    assert.notEqual(
      await promptSections(repo, `prompts/${type}.md`).catch(() => undefined),
      undefined,
      `prompts/${type}.md is missing`,
    );
});

test("prompts: every prompt file declares requiredSections in front matter", async () => {
  for (const type of await siteTypes())
    assert.ok(
      Array.isArray(await promptSections(repo, `prompts/${type}.md`)),
      `prompts/${type}.md has no requiredSections front matter`,
    );
});

test("prompts: the five fixed prompts list the agreed section ids", async () => {
  for (const [type, ids] of Object.entries(fixedSections))
    assert.deepEqual(await promptSections(repo, `prompts/${type}.md`), ids, type);
});

test("prompts: the two legacy prompts keep requiredSections empty", async () => {
  for (const type of looseTypes)
    assert.deepEqual(await promptSections(repo, `prompts/${type}.md`), [], type);
});

test("prompts: _template.md states that no AI or API key is used at runtime", async () => {
  const template = await readFile(join(repo, "prompts/_template.md"), "utf8");
  assert.ok(template.includes(templateRule), `"${templateRule}" not found`);
  for (const word of ["WebP", "woff2", "grok-", "meta.json", "thumb.webp", "架空", "デモ"])
    assert.ok(template.includes(word), `"${word}" not found in _template.md`);
});

test("prompts: README.md explains reusing promptPath and adding a type with site-types.json", async () => {
  const readme = await readFile(join(repo, "prompts/README.md"), "utf8");
  assert.match(readme, /promptPath/);
  assert.match(readme, /site-types\.json/);
  assert.match(readme, /prefix/);
});

test("prompts: prompts/ and tests/ are not listed as sites", async () => {
  const names = (await listFolders(repo)).map((folder) => folder.name);
  assert.ok(!names.includes("prompts"), names.join(", "));
  assert.ok(!names.includes("tests"), names.join(", "));
  assert.equal(names.length, 12);
});

test("requiredSections gate: every new site with promptPath has all required ids", async () => {
  const { errors } = await sectionGaps(repo);
  assert.deepEqual(errors, []);
});

test("requiredSections gate: prompt-missing-pricing is detected as missing id=\"pricing\"", async () => {
  const { checked, errors } = await sectionGaps(fixture("prompt-missing-pricing"));
  assert.deepEqual(checked, ["grok-sample"]);
  assert.deepEqual(errors, [
    'grok-sample: missing id="pricing" required by prompts/saas-lp.md',
  ]);
});

test("requiredSections gate: prompt-ok with every required id passes", async () => {
  const { checked, errors } = await sectionGaps(fixture("prompt-ok"));
  assert.deepEqual(checked, ["grok-sample"]);
  assert.deepEqual(errors, []);
});
