import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { prepareLatestFromDatabase, publishDueReveals } from "../lib/publisher.mjs"

function signalClient(row) {
  return {
    queries: [],
    async query(sql) {
      this.queries.push(sql)
      if (/SELECT/i.test(sql)) return { rows: [row] }
      return { rows: [] }
    },
  }
}

test("the database publisher starts and extends one public hash chain", async () => {
  const publicRoot = await mkdtemp(path.join(os.tmpdir(), "suya-publisher-public-"))
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "suya-publisher-private-"))
  const firstClient = signalClient({
    as_of_trade_date: "2026-08-05",
    source_generated_at: "2026-08-05T19:31:14+08:00",
    signal_level: -1,
    signal_label: "弱空",
  })

  const first = await prepareLatestFromDatabase({
    client: firstClient,
    publicRoot,
    privateRoot,
    expectedAsOfDate: "2026-08-05",
    committedAt: "2026-08-05T20:00:00+08:00",
    nonce: "a".repeat(64),
  })
  assert.equal(first.commitment.sequence, 1)
  assert.equal(first.commitment.previous_commitment, null)

  const secondClient = signalClient({
    as_of_trade_date: "2026-08-06",
    source_generated_at: "2026-08-06T19:35:00+08:00",
    signal_level: 2,
    signal_label: "强多",
  })
  const second = await prepareLatestFromDatabase({
    client: secondClient,
    publicRoot,
    privateRoot,
    expectedAsOfDate: "2026-08-06",
    committedAt: "2026-08-06T20:00:00+08:00",
    nonce: "b".repeat(64),
  })

  assert.equal(second.commitment.sequence, 2)
  assert.equal(second.commitment.previous_commitment, first.commitment.commitment)
  assert.equal(
    JSON.parse(await readFile(path.join(privateRoot, "pending/2026-08-06.json"), "utf8")).signal_label,
    "强多",
  )
})

test("the database entry point uses only the configured normal credential family", async () => {
  const source = await readFile(new URL("../bin/publish-from-database.mjs", import.meta.url), "utf8")
  for (const name of ["PG_NAS_HOST", "PG_NAS_PORT", "PG_NAS_USER", "PG_NAS_PASSWORD"]) {
    assert.match(source, new RegExp(name))
  }
  assert.doesNotMatch(source, /ADMIN|DDL/)
  assert.match(source, /LEDGER_PRIVATE_ROOT/)
})

test("pending records reveal only after five later table observations", async () => {
  const publicRoot = await mkdtemp(path.join(os.tmpdir(), "suya-reveal-public-"))
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "suya-reveal-private-"))
  const client = signalClient({
    as_of_trade_date: "2026-08-05",
    source_generated_at: "2026-08-05T19:31:14+08:00",
    signal_level: 0,
    signal_label: "看平",
  })
  await prepareLatestFromDatabase({
    client,
    publicRoot,
    privateRoot,
    expectedAsOfDate: "2026-08-05",
    committedAt: "2026-08-05T20:00:00+08:00",
    nonce: "c".repeat(64),
  })

  const revealClient = {
    queries: [],
    async query(sql, values) {
      this.queries.push({ sql, values })
      if (/observation_count/i.test(sql)) return { rows: [{ observation_count: 5 }] }
      return { rows: [] }
    },
  }
  const published = await publishDueReveals({ client: revealClient, publicRoot, privateRoot })

  assert.deepEqual(published, ["2026-08-05"])
  assert.equal(revealClient.queries[0].sql, "BEGIN READ ONLY")
  assert.deepEqual(revealClient.queries[1].values, ["2026-08-05"])
  assert.equal(revealClient.queries.at(-1).sql, "ROLLBACK")
  assert.equal(
    JSON.parse(await readFile(path.join(publicRoot, "reveals/2026/08/2026-08-05.json"), "utf8")).signal_label,
    "看平",
  )
})
