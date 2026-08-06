import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("the daily publisher reads local secrets, publishes one fresh record and stages only evidence", async () => {
  const script = await readFile(new URL("../ops/publish-daily.sh", import.meta.url), "utf8")

  assert.match(script, /\.secrets\/shared\.env/)
  assert.match(script, /TZ=Asia\/Shanghai date \+%F/)
  assert.match(script, /publish-from-database\.mjs/)
  assert.match(script, /reveal-due-from-database\.mjs/)
  assert.match(script, /git add commitments reveals/)
  assert.match(script, /git@github\.com:sowelswl\/suya-market-regime-ledger\.git/)
  assert.doesNotMatch(script, /git add -A/)
  assert.doesNotMatch(script, /PASSWORD=.*[^$]/)
})

test("the launchd runbook schedules weekdays after the database generation window", async () => {
  const runbook = await readFile(new URL("../ops/launchd.md", import.meta.url), "utf8")

  assert.match(runbook, /20:05/)
  assert.match(runbook, /Monday|周一/)
  assert.match(runbook, /Friday|周五/)
  assert.match(runbook, /独立运行副本/)
  assert.match(runbook, /不包含[^\n]*密码|不写入[^\n]*密码/)
})

test("Pages tolerates a slow deployment queue", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8")

  assert.match(workflow, /uses: actions\/deploy-pages@v4\n\s+with:\n\s+timeout: 1800000/)
})

test("the local watchdog verifies evidence and retries only a completed failed Pages run", async () => {
  const script = await readFile(new URL("../ops/verify-daily-publication.sh", import.meta.url), "utf8")

  assert.match(script, /TZ=Asia\/Shanghai date \+%F/)
  assert.match(script, /repos\/\$repo_slug\/contents\/\$commitment_path/)
  assert.match(script, /Attest public ledger evidence/)
  assert.match(script, /suya-market-regime-ledger\/data\/index\.json/)
  assert.match(script, /gh run rerun/)
  assert.match(script, /run_status[^\n]*!=[^\n]*completed/)
  assert.doesNotMatch(script, /run_status[^\n]*==[^\n]*(pending|queued|in_progress)/)
  assert.match(script, /conclusion \/\/ "none"/)
  assert.match(script, /join\("\|"\)/)
  assert.match(script, /osascript/)
  assert.doesNotMatch(script, /shared\.env|PG_NAS|PASSWORD/)
})

test("the launchd runbook documents two publication checks after the daily run", async () => {
  const runbook = await readFile(new URL("../ops/launchd.md", import.meta.url), "utf8")

  assert.match(runbook, /20:20/)
  assert.match(runbook, /20:40/)
  assert.match(runbook, /verify-daily-publication\.sh/)
  assert.doesNotMatch(runbook, /pmset|wakeorpoweron|定时唤醒/)
})
