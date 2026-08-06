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
