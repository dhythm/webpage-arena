import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import * as sites from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const fixture = (name) => resolve(repo, "tests/fixtures", name);
function smoke(root) {
  const run = spawnSync(
    process.execPath,
    [resolve(repo, "scripts/smoke.mjs"), "--root", root],
    { cwd: repo, encoding: "utf8", timeout: 120000 },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

test("discovery: top-level tests/ and prompts/ are not sites even with index.html and meta.json", async () => {
  const root = fixture("thumb-excluded");
  assert.deepEqual(
    (await sites.listFolders(root)).map((folder) => folder.name),
    ["grok-sample"],
  );
  assert.deepEqual(await sites.listSites(root), ["grok-sample"]);
  assert.deepEqual(await sites.siteCoverage(root), {
    expected: 1,
    sites: ["grok-sample"],
    missingIndex: [],
    missingMeta: [],
    problems: [],
  });
});

test("summary: a meta-only folder shows up as missing in the count line instead of as listed", () => {
  const { status, output } = smoke("tests/fixtures/meta-no-index");
  assert.notEqual(status, 0, output);
  assert.match(output, /^Smoke: site count mismatch: 1 expected, 0 listed$/m);
  assert.match(
    output,
    /^Smoke: missing: 1 without index\.html \(grok-sample\), 0 without meta\.json$/m,
  );
});

test("summary: an index-only folder shows up as missing meta.json in the count line", () => {
  const { status, output } = smoke("tests/fixtures/meta-missing");
  assert.notEqual(status, 0, output);
  assert.match(output, /^Smoke: site count mismatch: 2 expected, 1 listed$/m);
  assert.match(
    output,
    /^Smoke: missing: 0 without index\.html, 1 without meta\.json \(grok-orphan\)$/m,
  );
});

test("summary: build and smoke share the same count lines", async () => {
  const coverage = await sites.siteCoverage(fixture("meta-no-index"));
  assert.deepEqual(sites.coverageSummary("Build", coverage), [
    "Build: site count mismatch: 1 expected, 0 listed",
    "Build: missing: 1 without index.html (grok-sample), 0 without meta.json",
  ]);
});
