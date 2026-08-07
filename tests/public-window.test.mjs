import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createLedgerEntry } from "../lib/ledger.mjs"
import { prunePublicReveals } from "../lib/public-window.mjs"

test("the current public tree retains reveals only for the latest 20 commitments", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-public-window-"))
  let previousCommitment = null

  for (let day = 1; day <= 22; day += 1) {
    const date = `2026-07-${String(day).padStart(2, "0")}`
    const entry = createLedgerEntry({
      sequence: day,
      previousCommitment,
      asOfTradeDate: date,
      committedAt: `${date}T20:00:00+08:00`,
      sourceGeneratedAt: `${date}T19:30:00+08:00`,
      signalLevel: 1,
      signalLabel: "弱多",
      nonce: String(day).padStart(64, "0"),
    })
    previousCommitment = entry.commitment.commitment
    await mkdir(path.join(root, "commitments/2026/07"), { recursive: true })
    await mkdir(path.join(root, "reveals/2026/07"), { recursive: true })
    await writeFile(path.join(root, `commitments/2026/07/${date}.json`), JSON.stringify(entry.commitment))
    await writeFile(path.join(root, `reveals/2026/07/${date}.json`), JSON.stringify(entry.reveal))
  }

  const removed = await prunePublicReveals(root, { windowSize: 20 })
  const remaining = (await readdir(path.join(root, "reveals/2026/07"))).filter((name) => name.endsWith(".json"))

  assert.deepEqual(removed, ["2026-07-01", "2026-07-02"])
  assert.equal(remaining.length, 20)
  assert.equal(remaining.includes("2026-07-01.json"), false)
  assert.equal(remaining.includes("2026-07-22.json"), true)
})

test("publication policy freezes the rolling window and aggregate-only historical boundary", async () => {
  const [policySource, methodology, workflow] = await Promise.all([
    readFile(new URL("../publication/v1.json", import.meta.url), "utf8"),
    readFile(new URL("../PUBLICATION_POLICY_V1.md", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/attest.yml", import.meta.url), "utf8"),
  ])
  const policy = JSON.parse(policySource)

  assert.equal(policy.version, "1.0.0")
  assert.equal(policy.current_public_tree.signal_window_in_trading_days, 20)
  assert.equal(policy.historical_evaluation.raw_daily_signal_sequence, false)
  assert.equal(policy.historical_evaluation.aggregate_metrics, true)
  assert.equal(policy.threat_model.protects_against_casual_bulk_history_access, true)
  assert.equal(policy.threat_model.protects_against_persistent_archiving, false)
  assert.match(methodology, /Git 历史[^\n]*仍可追溯/)
  assert.match(workflow, /evaluation\/public\/history\.json/)
  assert.match(workflow, /publication\/v1\.json/)
  assert.match(workflow, /PUBLICATION_POLICY_V1\.md/)
})
