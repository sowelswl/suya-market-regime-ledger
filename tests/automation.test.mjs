import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

test("the daily publisher reads local secrets, publishes one fresh record and stages only evidence", async () => {
  const [script, notifier] = await Promise.all([
    readFile(new URL("../ops/publish-daily.sh", import.meta.url), "utf8"),
    readFile(new URL("../ops/notify.sh", import.meta.url), "utf8"),
  ])

  assert.match(script, /\.secrets\/shared\.env/)
  assert.match(script, /TZ=Asia\/Shanghai date \+%F/)
  assert.match(script, /publish-from-database\.mjs/)
  assert.match(script, /reveal-due-from-database\.mjs/)
  assert.match(script, /build-historical-evaluation-from-database\.mjs/)
  assert.match(script, /prune-public-reveals\.mjs/)
  assert.match(script, /build-revealed-outcomes-from-database\.mjs/)
  assert.match(script, /git add commitments reveals/)
  assert.match(script, /evaluation\/public\/history\.json/)
  assert.match(script, /evaluation\/public\/revealed-outcomes\.json/)
  assert.match(script, /git@github\.com:sowelswl\/suya-market-regime-ledger\.git/)
  assert.match(script, /trap[^\n]*ERR/)
  assert.match(script, /数据库[^\n]*新鲜|database[^\n]*fresh/i)
  assert.match(script, /GitHub[^\n]*push|push[^\n]*GitHub/i)
  assert.match(script, /notify_ledger/)
  assert.match(script, /SUYA_NODE_BIN/)
  assert.match(script, /Node[^\n]*(?:runtime|运行时)/i)
  assert.match(script, /发布成功/)
  assert.match(script, /SUYA_DEFER_FAILURE_NOTIFICATION/)
  assert.match(notifier, /osascript/)
  assert.match(notifier, /Notification delivery failed|通知[^\n]*失败/)
  assert.doesNotMatch(notifier, /2>&1\s*\|\|\s*true/)
  assert.doesNotMatch(script, /git add -A/)
  assert.doesNotMatch(script, /PASSWORD=.*[^$]/)
  assert.doesNotMatch(notifier, /PASSWORD|TOKEN|shared\.env/)
})

test("the launchd installer installs one weekday publisher at 20:10 with pinned Node runtime", async () => {
  const installer = await readFile(new URL("../ops/install-launchd.sh", import.meta.url), "utf8")

  assert.match(installer, /for weekday in 1 2 3 4 5/)
  assert.doesNotMatch(installer, /for weekday in 2 3 4 5 6/)
  assert.match(installer, /Hour[^\n]*20|<integer>20<\/integer>/)
  assert.match(installer, /publisher_plist=[\s\S]*?\n\s+10\)"/)
  assert.match(installer, /publish-with-retry\.sh/)
  assert.doesNotMatch(installer, /watchdog_plist=/)
  assert.match(installer, /bootout[^\n]*market-regime-ledger-watchdog/)
  assert.match(installer, /disable[^\n]*market-regime-ledger-watchdog/)
  assert.match(installer, /SUYA_NODE_BIN/)
  assert.match(installer, /node@24/)
  assert.match(installer, /SUYA_LAUNCHD_DRY_RUN/)
  assert.ok(installer.indexOf("local minute") < installer.indexOf("for weekday in 1 2 3 4 5"))
  assert.doesNotMatch(installer, /for weekday in 1 2 3 4 5; do\s+\n\s*local minute/)
  assert.match(installer, /plutil[^\n]*-lint/)
  assert.match(installer, /launchctl[^\n]*bootstrap/)
})

test("the launchd runbook documents one deterministic publisher and no Healthchecks", async () => {
  const runbook = await readFile(new URL("../ops/launchd.md", import.meta.url), "utf8")

  assert.match(runbook, /20:10/)
  assert.match(runbook, /20:40/)
  assert.match(runbook, /Monday|周一/)
  assert.match(runbook, /Friday|周五/)
  assert.match(runbook, /独立运行副本/)
  assert.match(runbook, /不包含[^\n]*密码|不写入[^\n]*密码/)
  assert.match(runbook, /一个[^\n]*LaunchAgent|单一[^\n]*LaunchAgent/)
  assert.match(runbook, /不使用[^\n]*Healthchecks|Healthchecks[^\n]*不再/)
  assert.doesNotMatch(runbook, /两个任务创建 Healthchecks/)
})

test("the local publisher retries only stale-source failures through 20:40", async () => {
  const script = await readFile(new URL("../ops/publish-with-retry.sh", import.meta.url), "utf8")

  assert.match(script, /publish-daily\.sh/)
  assert.match(script, /SUYA_DEFER_FAILURE_NOTIFICATION=1/)
  assert.match(script, /No fresh signal for expected as-of date/)
  assert.match(script, /300/)
  assert.match(script, /2040/)
  assert.match(script, /sleep/)
  assert.match(script, /notify_ledger/)
  assert.doesNotMatch(script, /Healthchecks|ping\//i)
})

test("the retry wrapper preserves the publisher failure code at the deadline", {
  skip: process.platform !== "darwin" && "launchd publisher runs only on macOS",
}, async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "suya-ledger-retry-"))
  const opsDir = path.join(temporaryRoot, "ops")
  const fakePublisher = path.join(temporaryRoot, "fake-publisher.sh")
  const wrapper = fileURLToPath(new URL("../ops/publish-with-retry.sh", import.meta.url))

  try {
    await mkdir(opsDir)
    await writeFile(path.join(opsDir, "notify.sh"), "notify_ledger() { :; }\n")
    await writeFile(
      fakePublisher,
      '#!/bin/zsh\necho "No fresh signal for expected as-of date 2099-01-01" >&2\nexit 17\n',
    )
    await chmod(fakePublisher, 0o755)

    const result = spawnSync("/bin/zsh", [wrapper], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUYA_LEDGER_REPO: temporaryRoot,
        SUYA_PUBLISH_SCRIPT: fakePublisher,
        SUYA_PUBLISH_DEADLINE_HHMM: "0000",
      },
    })

    assert.equal(result.status, 17)
    assert.match(result.stderr, /No fresh signal/)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test("the public docs snapshot is built locally without deploy-pages", async () => {
  const [packageJson, publisher] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../ops/publish-daily.sh", import.meta.url), "utf8"),
  ])

  assert.match(packageJson, /"build:pages":\s*"node bin\/build-pages\.mjs"/)
  assert.match(publisher, /npm_bin["']?\s+run build:pages/)
  assert.match(publisher, /prune-public-reveals\.mjs/)
  assert.match(publisher, /git add commitments reveals[^\n]*docs/)
  await assert.rejects(
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    (error) => error?.code === "ENOENT",
  )
})

test("the local watchdog verifies remote evidence, attestation and the raw public snapshot", async () => {
  const script = await readFile(new URL("../ops/verify-daily-publication.sh", import.meta.url), "utf8")

  assert.match(script, /TZ=Asia\/Shanghai date \+%F/)
  assert.match(script, /repos\/\$repo_slug\/contents\/\$commitment_path/)
  assert.match(script, /Attest public ledger evidence/)
  assert.match(script, /raw\.githubusercontent\.com\/sowelswl\/suya-market-regime-ledger\/main\/docs\/data\/index\.json/)
  assert.match(script, /gh run rerun/)
  assert.doesNotMatch(script, /pages\.yml|deploy-pages|pages\/builds|workflow run/)
  assert.match(script, /conclusion \/\/ "none"/)
  assert.match(script, /join\("\|"\)/)
  assert.match(script, /osascript/)
  assert.match(script, /定时发布未完成|scheduled[^\n]*did not run/i)
  assert.match(script, /GitHub[^\n]*(?:推送|push)/i)
  assert.match(script, /trap[^\n]*ERR/)
  assert.doesNotMatch(script, /shared\.env|PG_NAS|PASSWORD/)
})

test("the launchd runbook delegates remote acceptance to the Codex audit", async () => {
  const runbook = await readFile(new URL("../ops/launchd.md", import.meta.url), "utf8")

  assert.match(runbook, /20:45/)
  assert.match(runbook, /verify-daily-publication\.sh/)
  assert.match(runbook, /raw\.githubusercontent\.com|公开 JSON/)
  assert.match(runbook, /Codex[^\n]*审计|审计[^\n]*Codex/)
  assert.doesNotMatch(runbook, /pmset|wakeorpoweron|定时唤醒/)
})
