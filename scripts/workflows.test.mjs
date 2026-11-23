import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, chmod, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
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

function gateScript(text) {
  const [first] = jobs(text);
  const start = first.lines.findIndex((line) => /^(-\s+)?run:\s*\|\s*$/.test(line.trim()));
  assert.notEqual(start, -1, "先頭ジョブに run: | のブロックが無い");
  const indent = indentOf(first.lines[start]);
  const end = first.lines.findIndex((line, i) => i > start && indentOf(line) <= indent);
  const lines = first.lines.slice(start + 1, end === -1 ? undefined : end);
  const base = Math.min(...lines.map(indentOf));
  const script = lines.map((line) => line.slice(base)).join("\n") + "\n";
  assert.doesNotMatch(script, /\$\{\{/, "gate の run: に式 ${{ }} が埋め込まれている（env 経由にする）");
  return script;
}

const stubCurl = `#!/usr/bin/env bash
out=/dev/stdout
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "$STUB_CURL_EXIT" ]; then
  echo "curl: ($STUB_CURL_EXIT) Could not resolve host: api.github.invalid" >&2
  printf '%s' "$STUB_CURL_STDOUT"
  exit "$STUB_CURL_EXIT"
fi
printf '%s' "$STUB_BODY" > "$out"
printf '%s' "$STUB_STATUS"
`;

async function runGate(stub) {
  const script = gateScript(await pagesYaml());
  const dir = await mkdtemp(join(tmpdir(), "pages-gate-"));
  try {
    const bin = join(dir, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "curl"), stubCurl);
    await chmod(join(bin, "curl"), 0o755);
    const scriptPath = join(dir, "gate.sh");
    await writeFile(scriptPath, script);
    const output = join(dir, "github_output");
    await writeFile(output, "");
    const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", scriptPath], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        GH_TOKEN: "stub-token",
        API_URL: "https://api.github.invalid",
        REPO: "owner/repo",
        STUB_STATUS: stub.status ?? "",
        STUB_BODY: stub.body ?? "",
        STUB_CURL_EXIT: stub.curlExit ?? "",
        STUB_CURL_STDOUT: stub.curlStdout ?? "",
      },
    });
    return {
      code: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      output: await readFile(output, "utf8"),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function describe(r) {
  return `exit=${r.code} output=${JSON.stringify(r.output)} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`;
}

function assertGateFails(r, label) {
  assert.notEqual(r.code, 0, `${label}: gate が exit 0 で終わった（静かに skip / deploy してしまう）: ${describe(r)}`);
  assert.match(r.stdout, /::error/, `${label}: ::error が出ていない: ${describe(r)}`);
  assert.doesNotMatch(r.output, /enabled=/, `${label}: enabled= を書いている: ${describe(r)}`);
}

test("workflows gate: 200 かつ build_type=workflow のときだけ enabled=true で exit 0（stub curl で実行）", async () => {
  const r = await runGate({ status: "200", body: JSON.stringify({ build_type: "workflow", html_url: "https://owner.github.io/repo/" }) });
  assert.equal(r.code, 0, describe(r));
  assert.equal(r.output.trim(), "enabled=true", describe(r));
  assert.doesNotMatch(r.stdout, /::error/, describe(r));
});

test("workflows gate: 404 は notice「Pages 未有効のためスキップ」・enabled=false・exit 0（stub curl で実行）", async () => {
  const r = await runGate({ status: "404", body: JSON.stringify({ message: "Not Found" }) });
  assert.equal(r.code, 0, describe(r));
  assert.equal(r.output.trim(), "enabled=false", describe(r));
  assert.match(r.stdout, /::notice[^\n]*Pages 未有効のためスキップ/, describe(r));
});

for (const status of ["403", "500", "502", "503", "301", "401"]) {
  test(`workflows gate: HTTP ${status} は ::error で非ゼロ終了し、skip も deploy もしない（stub curl で実行）`, async () => {
    const r = await runGate({ status, body: JSON.stringify({ message: "boom", build_type: "workflow" }) });
    assertGateFails(r, `HTTP ${status}`);
    assert.match(r.stdout, new RegExp(`::error[^\\n]*${status}`), `HTTP ${status}: ::error に status が出ていない: ${describe(r)}`);
  });
}

for (const [label, stub] of [
  ["curl が失敗し -w で 000 を出す（exit 6）", { curlExit: "6", curlStdout: "000" }],
  ["curl が失敗し何も出さない（exit 7）", { curlExit: "7", curlStdout: "" }],
]) {
  test(`workflows gate: ネットワークエラー（${label}）は status 000 として ::error で非ゼロ終了（stub curl で実行）`, async () => {
    const r = await runGate(stub);
    assertGateFails(r, label);
    assert.match(r.stdout, /::error[^\n]*000/, `${label}: ::error に 000 が出ていない: ${describe(r)}`);
  });
}

for (const [label, body] of [
  ["build_type: legacy", JSON.stringify({ build_type: "legacy" })],
  ["build_type 欠落", JSON.stringify({ html_url: "https://owner.github.io/repo/" })],
  ["build_type: null", JSON.stringify({ build_type: null })],
  ["build_type: Workflow（大文字違い）", JSON.stringify({ build_type: "Workflow" })],
  ["本文が JSON でない", "<html>oops</html>"],
  ["本文が空", ""],
]) {
  test(`workflows gate: 200 でも ${label} なら「Source を GitHub Actions に」の ::error で非ゼロ終了（stub curl で実行）`, async () => {
    const r = await runGate({ status: "200", body });
    assertGateFails(r, `200 + ${label}`);
    assert.match(r.stdout, /::error[^\n]*Source を GitHub Actions に/, `200 + ${label}: Source の案内が無い: ${describe(r)}`);
  });
}

test("workflows gate: enabled=true は 200) の中だけ、catch-all *) は ::error と exit 1、curl 失敗は || status=000", async () => {
  const script = gateScript(await pagesYaml());
  assert.equal(script.match(/enabled=true/g)?.length, 1, "enabled=true がちょうど 1 か所でない");
  const branches = script.split(/^\s*(?=\S+\)\s*$)/m);
  const ok = branches.find((b) => /^200\)/.test(b));
  const rest = branches.find((b) => /^\*\)/.test(b));
  assert.ok(ok, "case に 200) が無い");
  assert.ok(rest, "case に catch-all *) が無い");
  assert.match(ok.split(/^\s*;;/m)[0], /enabled=true/, "enabled=true が 200) の中に無い");
  const catchAll = rest.split(/^\s*;;/m)[0];
  assert.match(catchAll, /::error/, "*) が ::error を出していない");
  assert.match(catchAll, /^\s*exit 1\s*$/m, "*) が exit 1 していない");
  assert.doesNotMatch(catchAll, /enabled=/, "*) が enabled= を書いている");
  assert.match(script, /curl -sS /, "curl の -sS が無い");
  assert.doesNotMatch(script, /-o \/dev\/null/, "レスポンス本文を捨てている（build_type を読めない）");
  assert.match(script, /status=\$\(curl[\s\S]*?\)\s*\|\|\s*status=000/, "curl 失敗時に status=000 にしていない");
});
