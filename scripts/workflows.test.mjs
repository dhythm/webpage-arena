import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const repo = resolve(import.meta.dirname, "..");
const pagesPath = resolve(repo, ".github/workflows/pages.yml");
async function pagesYaml() {
  let text;
  try {
    text = await readFile(pagesPath, "utf8");
  } catch (error) {
    assert.fail(`.github/workflows/pages.yml を読めない: ${error.code ?? error.message}`);
  }
  return text.replace(/\r\n/g, "\n");
}
function contentLines(text) {
  return text.split("\n").filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
}
function indentOf(line) {
  return line.length - line.trimStart().length;
}
function block(lines, key, indent) {
  const start = lines.findIndex(
    (line) => indentOf(line) === indent && new RegExp(`^${key}:(\\s|$)`).test(line.trim()),
  );
  if (start === -1) return null;
  const body = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (indentOf(line) <= indent) break;
    body.push(line);
  }
  return body;
}
function topLevel(text, key) {
  return block(contentLines(text), key, 0);
}
function jobs(text) {
  const section = topLevel(text, "jobs");
  assert.ok(section, "pages.yml に jobs: が無い");
  const body = section.slice(1);
  const indent = Math.min(...body.map(indentOf));
  const names = body
    .filter((line) => indentOf(line) === indent && /^[\w-]+:\s*$/.test(line.trim()))
    .map((line) => line.trim().slice(0, -1));
  return names.map((name) => ({ name, lines: block(body, name, indent) }));
}
function jobPermissions(job) {
  const indent = indentOf(job.lines[1]);
  const inline = job.lines.find(
    (line) => indentOf(line) === indent && /^permissions:\s*\S/.test(line.trim()),
  );
  if (inline) return [inline];
  return block(job.lines, "permissions", indent) ?? [];
}
function writeScopes(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => /:\s*write\b/.test(line) || /write-all/.test(line));
}
function jobIf(job) {
  const indent = indentOf(job.lines[1]);
  const line = job.lines.find((l) => indentOf(l) === indent && /^if:/.test(l.trim()));
  return line ? line.trim() : "";
}
function findJob(all, pattern) {
  return all.find((job) => job.lines.some((line) => pattern.test(line)));
}

test("workflows [1/5]: pages.yml に pull_request トリガーが無い（PR では起動しない）", async () => {
  const text = await pagesYaml();
  const on = topLevel(text, "on");
  assert.ok(on, "pages.yml に on: が無い");
  const triggers = on.join("\n");
  assert.doesNotMatch(text, /pull_request/, "pages.yml に pull_request / pull_request_target がある");
  assert.match(triggers, /^\s+push:\s*$/m, "push トリガーが無い");
  assert.match(triggers, /branches:\s*\[\s*main\s*\]/, "push の branches が [main] でない");
  assert.match(triggers, /^\s+workflow_dispatch:/m, "workflow_dispatch トリガーが無い");
  const names = on
    .slice(1)
    .filter((line) => indentOf(line) === indentOf(on[1]))
    .map((line) => line.trim().split(":")[0]);
  assert.deepEqual(names.sort(), ["push", "workflow_dispatch"]);
});

test("workflows [2/5]: concurrency の group が pages で cancel-in-progress が false", async () => {
  const text = await pagesYaml();
  const concurrency = topLevel(text, "concurrency");
  assert.ok(concurrency, "workflow 全体の concurrency: が無い");
  const body = concurrency.join("\n");
  assert.match(body, /^\s+group:\s*["']?pages["']?\s*$/m, "concurrency.group が pages でない");
  assert.match(body, /^\s+cancel-in-progress:\s*false\s*$/m, "cancel-in-progress が false でない");
  assert.equal(text.match(/^\s*concurrency:/gm).length, 1, "concurrency が複数ある");
});

test("workflows [3/5]: 書き込み権限（pages: write・id-token: write）は deploy ジョブにだけある", async () => {
  const text = await pagesYaml();
  const all = jobs(text);
  const top = topLevel(text, "permissions");
  assert.ok(top, "workflow 全体の permissions: が無い（既定の権限に頼らない）");
  assert.deepEqual(writeScopes(top), [], "workflow 全体に書き込み権限がある");
  const deploy = all.find((job) => job.name === "deploy");
  assert.ok(deploy, "deploy ジョブが無い");
  const deployWrites = writeScopes(jobPermissions(deploy)).sort();
  assert.deepEqual(deployWrites, ["id-token: write", "pages: write"]);
  for (const job of all.filter((j) => j !== deploy)) {
    const permissions = jobPermissions(job);
    assert.ok(permissions.length > 0, `${job.name} ジョブに permissions: が無い`);
    assert.deepEqual(writeScopes(permissions), [], `${job.name} ジョブに書き込み権限がある`);
  }
  const everyWrite = contentLines(text).filter((line) => /write/.test(line));
  assert.equal(everyWrite.length, 2, `write の行が deploy の 2 行以外にもある: ${everyWrite.join(" / ")}`);
});

test("workflows [4/5]: 先頭ジョブで Pages の有効性を確かめ、404 なら notice を出して build・deploy を skip する", async () => {
  const text = await pagesYaml();
  const all = jobs(text);
  const [first] = all;
  const body = first.lines.join("\n");
  assert.match(body, /repos\/\$\{\{\s*github\.repository\s*\}\}\/pages|repos\/\$\{?REPO\}?\/pages/, "先頭ジョブで GET /repos/{repo}/pages をしていない");
  assert.match(body, /404/, "先頭ジョブが 404 を扱っていない");
  assert.match(body, /::notice[^\n]*Pages 未有効のためスキップ/, "404 のときの notice が無い");
  assert.match(body, /^\s+outputs:\s*$/m, "先頭ジョブが outputs を出していない");
  assert.doesNotMatch(body, /npm run build|deploy-pages/, "先頭ジョブで build や deploy をしている");
  const builder = findJob(all, /upload-pages-artifact/);
  const deploy = all.find((job) => job.name === "deploy");
  assert.ok(builder && deploy, "build ジョブか deploy ジョブが無い");
  for (const job of [builder, deploy]) {
    const condition = jobIf(job);
    assert.match(
      condition,
      new RegExp(`needs\\.${first.name}\\.outputs\\.\\w+\\s*==\\s*'true'`),
      `${job.name} ジョブが Pages 有効のときだけ走る if を持っていない`,
    );
    assert.match(job.lines.join("\n"), new RegExp(`needs:[^\\n]*\\b${first.name}\\b`), `${job.name} が ${first.name} を needs していない`);
  }
  assert.match(deploy.lines.join("\n"), new RegExp(`needs:[^\\n]*\\b${builder.name}\\b`), "deploy が build を needs していない");
});

test("workflows: build・deploy は main のときだけ走る（workflow_dispatch で別ブランチを公開しない）", async () => {
  const all = jobs(await pagesYaml());
  const builder = findJob(all, /upload-pages-artifact/);
  const deploy = all.find((job) => job.name === "deploy");
  assert.ok(builder && deploy, "build ジョブか deploy ジョブが無い");
  for (const job of [builder, deploy]) {
    const condition = jobIf(job);
    assert.match(condition, /&&\s*github\.ref\s*==\s*'refs\/heads\/main'/, `${job.name} ジョブの if が main に限っていない`);
    assert.doesNotMatch(condition, /\|\|/, `${job.name} ジョブの if に || がある`);
  }
});

test("workflows [5/5]: 公開パスは dist だけで、npm ci → check → build → upload → deploy の順", async () => {
  const text = await pagesYaml();
  const uploads = [...text.matchAll(/uses:\s*actions\/upload-pages-artifact@\S+/g)];
  assert.equal(uploads.length, 1, "upload-pages-artifact がちょうど 1 回でない");
  const paths = [...text.matchAll(/^\s+path:\s*(\S+)\s*$/gm)].map((match) => match[1].replace(/["']/g, ""));
  assert.deepEqual(paths, ["dist"], "公開パスが dist だけでない");
  assert.match(text, /uses:\s*actions\/deploy-pages@\S+/, "actions/deploy-pages が無い");
  const order = ["npm ci", "npm run check", "npm run build", "actions/upload-pages-artifact", "actions/deploy-pages"];
  const positions = order.map((step) => text.indexOf(step));
  assert.ok(positions.every((p) => p !== -1), `手順が足りない: ${order.filter((_, i) => positions[i] === -1).join(", ")}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "手順の順番が違う");
});

test("workflows: 標準ランナー（ubuntu-latest）と Node 20 だけを使う", async () => {
  const text = await pagesYaml();
  const runners = [...text.matchAll(/runs-on:\s*(\S+)/g)].map((match) => match[1]);
  assert.ok(runners.length > 0, "runs-on が無い");
  assert.ok(runners.every((runner) => runner === "ubuntu-latest"), `標準ランナー以外がある: ${runners.join(", ")}`);
  assert.match(text, /node-version:\s*["']?20["']?\s*$/m, "Node 20 を使っていない");
});
