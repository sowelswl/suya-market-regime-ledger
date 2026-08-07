import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { createLedgerEntry } from "../lib/ledger.mjs"
import { buildSiteData } from "../lib/site-data.mjs"

test("site data joins public commitments and reveals without private material", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-site-data-"))
  const entry = createLedgerEntry({
    sequence: 1,
    previousCommitment: null,
    asOfTradeDate: "2026-08-05",
    committedAt: "2026-08-05T20:00:00+08:00",
    sourceGeneratedAt: "2026-08-05T19:31:14+08:00",
    signalLevel: -2,
    signalLabel: "强空",
    nonce: "e".repeat(64),
  })

  await mkdir(path.join(root, "commitments/2026/08"), { recursive: true })
  await mkdir(path.join(root, "reveals/2026/08"), { recursive: true })
  await writeFile(path.join(root, "commitments/2026/08/2026-08-05.json"), JSON.stringify(entry.commitment))
  await writeFile(path.join(root, "reveals/2026/08/2026-08-05.json"), JSON.stringify(entry.reveal))

  const data = await buildSiteData(root)
  assert.equal(data.records.length, 1)
  assert.equal(data.records[0].commitment.as_of_trade_date, "2026-08-05")
  assert.equal(data.records[0].reveal.signal_label, "强空")
  assert.equal(data.generated_at, entry.commitment.committed_at)
  assert.equal("private" in data, false)
})

test("site data exposes only the latest 20 records and includes aggregate historical evaluation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-site-window-"))
  let previousCommitment = null

  for (let day = 1; day <= 25; day += 1) {
    const date = `2026-07-${String(day).padStart(2, "0")}`
    const entry = createLedgerEntry({
      sequence: day,
      previousCommitment,
      asOfTradeDate: date,
      committedAt: `${date}T20:00:00+08:00`,
      sourceGeneratedAt: `${date}T19:30:00+08:00`,
      signalLevel: 0,
      signalLabel: "看平",
      nonce: String(day).padStart(64, "0"),
    })
    previousCommitment = entry.commitment.commitment
    await mkdir(path.join(root, "commitments/2026/07"), { recursive: true })
    await mkdir(path.join(root, "reveals/2026/07"), { recursive: true })
    await writeFile(path.join(root, `commitments/2026/07/${date}.json`), JSON.stringify(entry.commitment))
    await writeFile(path.join(root, `reveals/2026/07/${date}.json`), JSON.stringify(entry.reveal))
  }

  const evaluation = { policy_version: "1.1.0", scope: { observations: 956 } }
  await mkdir(path.join(root, "evaluation/public"), { recursive: true })
  await writeFile(path.join(root, "evaluation/public/history.json"), JSON.stringify(evaluation))

  const data = await buildSiteData(root)

  assert.equal(data.records.length, 20)
  assert.equal(data.records[0].commitment.as_of_trade_date, "2026-07-25")
  assert.equal(data.records.at(-1).commitment.as_of_trade_date, "2026-07-06")
  assert.deepEqual(data.historical_evaluation, evaluation)
  assert.equal(data.privacy.public_signal_window, 20)
})
