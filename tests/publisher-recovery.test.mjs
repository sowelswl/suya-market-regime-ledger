import assert from "node:assert/strict"
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

test("a failed publication leaves the runtime clone clean and retry preserves the original evidence", {
  skip: process.platform !== "darwin" && "publisher requires zsh on macOS",
}, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "suya-publisher-recovery-"))
  const repo = path.join(root, "repo")
  const remote = path.join(root, "remote.git")
  const privateRoot = path.join(root, "private")
  const bin = path.join(root, "bin")
  const git = (args, cwd = repo) => {
    const result = spawnSync("/usr/bin/git", args, { cwd, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  await mkdir(repo)
  await mkdir(bin)
  await mkdir(path.join(repo, "ops"))
  await writeFile(path.join(repo, "ops/notify.sh"), "notify_ledger() { :; }\n")
  for (const dir of ["commitments", "reveals", "corrections", "evaluation/public", "docs", "site", "bin"]) {
    await mkdir(path.join(repo, dir), { recursive: true })
    await writeFile(path.join(repo, dir, ".keep"), "")
  }
  await writeFile(path.join(repo, "original.txt"), "unchanged evidence\n")
  await writeFile(path.join(root, "shared.env"), "")
  git(["init", "--bare", remote], root)
  git(["init", "-b", "main"])
  git(["config", "user.name", "Test Publisher"])
  git(["config", "user.email", "publisher@example.invalid"])
  git(["add", "."])
  git(["commit", "-m", "initial"])
  git(["remote", "add", "origin", remote])
  git(["push", "-u", "origin", "main"])
  const fakeNode = path.join(bin, "node")
  await writeFile(fakeNode, `#!${process.execPath}
const fs = require("node:fs"); const path = require("node:path");
const args = process.argv.slice(2); const step = path.basename(args[0] || "");
if (step === "--version") { console.log("v24.0.0"); process.exit(0); }
if (step === "publish-from-database.mjs") {
  const date = args[args.indexOf("--expected-as-of-date") + 1];
  const folder = path.join("commitments", date.slice(0,4), date.slice(5,7));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, date + ".json"), JSON.stringify({ as_of_trade_date: date }));
  fs.mkdirSync(path.join(process.env.LEDGER_PRIVATE_ROOT, "pending"), { recursive: true });
  fs.writeFileSync(path.join(process.env.LEDGER_PRIVATE_ROOT, "pending", date + ".json"), "private-test-payload");
}
if (step === "build-historical-evaluation-from-database.mjs") fs.writeFileSync("evaluation/public/history.json", "{}");
if (step === "build-retrospective-signals-from-database.mjs") fs.writeFileSync("evaluation/public/retrospective-signals.json", "{}");
if (step === "build-revealed-outcomes-from-database.mjs") {
  if (process.env.FAIL_OUTCOMES === "1") { console.error("simulated outcome timeout"); process.exit(17); }
  fs.writeFileSync("evaluation/public/revealed-outcomes.json", "{}");
}
`)
  const fakeNpm = path.join(bin, "npm")
  await writeFile(fakeNpm, `#!${process.execPath}\nrequire("node:fs").writeFileSync("docs/index.html", "verified test snapshot " + (process.env.SNAPSHOT_REVISION || "1"));\n`)
  const fakeGit = path.join(bin, "git")
  await writeFile(fakeGit, '#!/bin/zsh\nif [[ "$1" == push && "$2" == git@github.com:sowelswl/suya-market-regime-ledger.git ]]; then\n  if [[ "${FAIL_PUSH:-0}" == 1 ]]; then exit 19; fi\n  shift 2; exec /usr/bin/git push origin "$@"\nfi\nexec /usr/bin/git "$@"\n')
  for (const file of [fakeNode, fakeNpm, fakeGit]) await chmod(file, 0o755)
  await cp(new URL("../ops/publish-daily.sh", import.meta.url), path.join(root, "publish.sh"))
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    SUYA_LEDGER_REPO: repo,
    SUYA_SHARED_ENV_FILE: path.join(root, "shared.env"),
    LEDGER_PRIVATE_ROOT: privateRoot,
    SUYA_NODE_BIN: fakeNode,
    SUYA_NPM_BIN: fakeNpm,
    GIT_AUTHOR_NAME: "Test Publisher", GIT_AUTHOR_EMAIL: "publisher@example.invalid",
    GIT_COMMITTER_NAME: "Test Publisher", GIT_COMMITTER_EMAIL: "publisher@example.invalid",
    TMPDIR: root,
  }
  const failed = spawnSync("/bin/zsh", [path.join(root, "publish.sh")], { env: { ...env, FAIL_OUTCOMES: "1" }, encoding: "utf8" })
  assert.equal(failed.status, 17, failed.stderr)
  assert.match(failed.stderr, /已揭示记录的次日市场结果/)
  assert.equal(git(["status", "--porcelain"]), "", "failed pipeline must not dirty runtime clone")
  const pushFailed = spawnSync("/bin/zsh", [path.join(root, "publish.sh")], { env: { ...env, FAIL_PUSH: "1" }, encoding: "utf8" })
  assert.equal(pushFailed.status, 19, pushFailed.stderr)
  assert.equal(git(["status", "--porcelain"]), "", "push failure must retain a complete clean local commit")
  assert.notEqual(git(["rev-parse", "HEAD"]), git(["rev-parse", "origin/main"]))
  const succeeded = spawnSync("/bin/zsh", [path.join(root, "publish.sh")], { env, encoding: "utf8" })
  assert.equal(succeeded.status, 0, succeeded.stderr)
  assert.equal(git(["status", "--porcelain"]), "")
  assert.equal(git(["rev-parse", "HEAD"]), git(["rev-parse", "origin/main"]))
  assert.equal(await readFile(path.join(repo, "original.txt"), "utf8"), "unchanged evidence\n")
  assert.equal((await readdir(path.join(privateRoot, "pending"))).length, 1)
  const refreshed = spawnSync("/bin/zsh", [path.join(root, "publish.sh")], { env: { ...env, SNAPSHOT_REVISION: "2" }, encoding: "utf8" })
  assert.equal(refreshed.status, 0, refreshed.stderr)
  assert.equal(git(["status", "--porcelain"]), "")
  assert.equal((await readdir(path.join(privateRoot, "pending"))).length, 1)
  const repeated = spawnSync("/bin/zsh", [path.join(root, "publish.sh")], { env, encoding: "utf8" })
  assert.equal(repeated.status, 0, repeated.stderr)
  assert.equal(git(["status", "--porcelain"]), "")
  assert.equal((await readdir(path.join(privateRoot, "pending"))).length, 1)
})
