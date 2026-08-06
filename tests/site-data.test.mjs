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
