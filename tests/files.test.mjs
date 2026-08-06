import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  appendCorrection,
  prepareSignalFiles,
  publishReveal,
} from "../lib/files.mjs"

const input = {
  signalDate: "2026-08-07",
  generatedAt: "2026-08-06T20:00:00+08:00",
  state: "看平",
  nonce: "a".repeat(64),
}

test("preparation writes one public commitment and one ignored private pending reveal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-"))
  const result = await prepareSignalFiles(root, input)

  assert.equal(result.commitmentPath, path.join(root, "commitments/2026/08/2026-08-07.json"))
  assert.equal(result.privateRevealPath, path.join(root, "private/pending/2026-08-07.json"))

  const commitment = JSON.parse(await readFile(result.commitmentPath, "utf8"))
  const pending = JSON.parse(await readFile(result.privateRevealPath, "utf8"))
  assert.equal("state" in commitment, false)
  assert.equal(pending.state, "看平")

  await assert.rejects(prepareSignalFiles(root, input), /already exists/i)
})

test("publishing a reveal verifies it and never removes the pending source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-"))
  const prepared = await prepareSignalFiles(root, input)
  const published = await publishReveal(root, input.signalDate)

  assert.equal(published.revealPath, path.join(root, "reveals/2026/08/2026-08-07.json"))
  assert.equal(JSON.parse(await readFile(published.revealPath, "utf8")).state, "看平")
  assert.equal(JSON.parse(await readFile(prepared.privateRevealPath, "utf8")).state, "看平")

  await assert.rejects(publishReveal(root, input.signalDate), /already exists/i)
})

test("corrections are appended as immutable JSON lines with original evidence retained", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-"))
  const record = {
    signal_date: input.signalDate,
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
