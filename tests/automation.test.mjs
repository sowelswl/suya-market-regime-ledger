import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
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
  assert.match(notifier, /osascript/)
  assert.match(notifier, /Notification delivery failed|通知[^\n]*失败/)
  assert.doesNotMatch(notifier, /2>&1\s*\|\|\s*true/)
  assert.doesNotMatch(script, /git add -A/)
  assert.doesNotMatch(script, /PASSWORD=.*[^$]/)
  assert.doesNotMatch(notifier, /PASSWORD|TOKEN|shared\.env/)
})

test("the launchd installer uses the correct Monday through Friday calendar and pinned Node runtime", async () => {
  const installer = await readFile(new URL("../ops/install-launchd.sh", import.meta.url), "utf8")

  assert.match(installer, /for weekday in 1 2 3 4 5/)
  assert.doesNotMatch(installer, /for weekday in 2 3 4 5 6/)
  assert.match(installer, /Hour[^\n]*20|<integer>20<\/integer>/)
  assert.match(installer, /publisher_plist=[\s\S]*?\n\s+5\)"/)
  assert.match(installer, /watchdog_plist=[\s\S]*?\n\s+20 40\)"/)
  assert.match(installer, /SUYA_NODE_BIN/)
  assert.match(installer, /node@24/)
  assert.match(installer, /SUYA_LAUNCHD_DRY_RUN/)
  assert.ok(installer.indexOf("local minute") < installer.indexOf("for weekday in 1 2 3 4 5"))
  assert.doesNotMatch(installer, /for weekday in 1 2 3 4 5; do\s+\n\s*local minute/)
  assert.match(installer, /plutil[^\n]*-lint/)
  assert.match(installer, /launchctl[^\n]*bootstrap/)
})

test("the launchd runbook schedules weekdays after the database generation window", async () => {
  const runbook = await readFile(new URL("../ops/launchd.md", import.meta.url), "utf8")

  assert.match(runbook, /20:05/)
  assert.match(runbook, /Monday|周一/)
  assert.match(runbook, /Friday|周五/)
  assert.match(runbook, /独立运行副本/)
  assert.match(runbook, /不包含[^\n]*密码|不写入[^\n]*密码/)
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

test("the launchd runbook documents two raw-data checks after the daily run", async () => {
  const runbook = await readFile(new URL("../ops/launchd.md", import.meta.url), "utf8")

  assert.match(runbook, /20:20/)
  assert.match(runbook, /20:40/)
  assert.match(runbook, /verify-daily-publication\.sh/)
  assert.match(runbook, /raw\.githubusercontent\.com|公开 JSON/)
  assert.match(runbook, /数据库[^\n]*更新|定时任务[^\n]*运行|GitHub[^\n]*推送/)
  assert.doesNotMatch(runbook, /pmset|wakeorpoweron|定时唤醒/)
})
