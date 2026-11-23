import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const run = spawnSync(
  process.execPath,
  [resolve(root, "scripts/smoke.mjs"), "--root", "tests/fixtures"],
  { cwd: root, encoding: "utf8" },
);
const output = `${run.stdout}${run.stderr}`;
process.stdout.write(output);
const expected = [
  ["horizontal overflow", "overflow"],
  ["external request", "external"],
  ["POST", "method"],
];
let detected = 0;
for (const [label, kind] of expected) {
  const hit = new RegExp(`^FAIL bad-site \\d+px ${kind}:`, "m").test(output);
  if (hit) detected++;
  console.log(`SELFTEST ${hit ? "PASS" : "FAIL"} detects ${label} (${kind})`);
}
if (run.status === 0) console.log("SELFTEST FAIL smoke exited 0 on bad-site");
console.log(
  `Selftest: smoke exit ${run.status}, ${detected}/${expected.length} failures detected`,
);
process.exit(run.status !== 0 && detected === expected.length ? 0 : 1);
