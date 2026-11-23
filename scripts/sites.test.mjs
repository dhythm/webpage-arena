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

test("listSites lists only folders that have meta.json", async () => {
  assert.deepEqual(await sites.listSites(fixture("meta-missing")), [
    "grok-sample",
  ]);
});

test("siteCoverage counts every folder with index.html or meta.json and reports the ones left out", async () => {
  assert.deepEqual(await sites.siteCoverage(fixture("meta-missing")), {
    expected: 2,
    sites: ["grok-sample"],
    problems: ["grok-orphan: index.html without meta.json"],
  });
  assert.deepEqual(await sites.siteCoverage(fixture("meta-no-index")), {
    expected: 1,
    sites: ["grok-sample"],
    problems: ["grok-sample: meta.json without index.html"],
  });
});

test("smoke fails and names a folder with index.html but no meta.json instead of dropping it", () => {
  const { status, output } = smoke("tests/fixtures/meta-missing");
  assert.notEqual(status, 0, output);
  assert.match(output, /^FAIL grok-orphan: index\.html without meta\.json$/m);
  assert.match(output, /^Smoke: site count mismatch: 2 expected, 1 listed$/m);
});

test("smoke fails and names a folder with meta.json but no index.html", () => {
  const { status, output } = smoke("tests/fixtures/meta-no-index");
  assert.notEqual(status, 0, output);
  assert.match(output, /^FAIL grok-sample: meta\.json without index\.html$/m);
});
