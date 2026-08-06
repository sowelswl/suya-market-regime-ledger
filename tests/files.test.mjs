import assert from "node:assert/strict"
import { mkdtemp, readFile, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  appendCorrection,
  prepareSignalFiles,
  publishReveal,
} from "../lib/files.mjs"

const input = {
  sequence: 1,
  previousCommitment: null,
  asOfTradeDate: "2026-08-05",
  committedAt: "2026-08-05T20:00:00+08:00",
  sourceGeneratedAt: "2026-08-05T19:31:14+08:00",
  signalLevel: 0,
  signalLabel: "看平",
  nonce: "a".repeat(64),
}

test("preparation separates public evidence from a permission-restricted private root", async () => {
  const publicRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-public-"))
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-private-"))
  const result = await prepareSignalFiles({ publicRoot, privateRoot, input })

  assert.equal(result.commitmentPath, path.join(publicRoot, "commitments/2026/08/2026-08-05.json"))
  assert.equal(result.privateRevealPath, path.join(privateRoot, "pending/2026-08-05.json"))

  const commitment = JSON.parse(await readFile(result.commitmentPath, "utf8"))
  const pending = JSON.parse(await readFile(result.privateRevealPath, "utf8"))
  assert.equal("signal_label" in commitment, false)
  assert.equal(pending.signal_label, "看平")
  assert.equal((await stat(result.privateRevealPath)).mode & 0o077, 0)

  await assert.rejects(prepareSignalFiles({ publicRoot, privateRoot, input }), /already exists/i)
})

test("publishing a reveal verifies it and never removes the pending source", async () => {
  const publicRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-public-"))
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-private-"))
  const prepared = await prepareSignalFiles({ publicRoot, privateRoot, input })
  const published = await publishReveal({ publicRoot, privateRoot, asOfTradeDate: input.asOfTradeDate })

  assert.equal(published.revealPath, path.join(publicRoot, "reveals/2026/08/2026-08-05.json"))
  assert.equal(JSON.parse(await readFile(published.revealPath, "utf8")).signal_label, "看平")
  assert.equal(JSON.parse(await readFile(prepared.privateRevealPath, "utf8")).signal_label, "看平")

  await assert.rejects(
    publishReveal({ publicRoot, privateRoot, asOfTradeDate: input.asOfTradeDate }),
    /already exists/i,
  )
})

test("corrections are appended as immutable JSON lines with original evidence retained", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-"))
  const record = {
    as_of_trade_date: input.asOfTradeDate,
    recorded_at: "2026-08-08T09:00:00+08:00",
    original_commitment: `sha256:${"b".repeat(64)}`,
    reason: "发现数据源缺失，原记录标记为无效",
    action: "invalidate",
  }

  await appendCorrection(root, record)
  await appendCorrection(root, { ...record, recorded_at: "2026-08-08T09:05:00+08:00", reason: "补充说明" })

  const lines = (await readFile(path.join(root, "corrections/corrections.jsonl"), "utf8")).trim().split("\n")
  assert.equal(lines.length, 2)
  assert.deepEqual(JSON.parse(lines[0]), record)
  assert.equal(JSON.parse(lines[1]).reason, "补充说明")
})
