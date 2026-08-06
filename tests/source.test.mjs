import assert from "node:assert/strict"
import test from "node:test"

import { fetchLatestSignal, normalizeSignalRow } from "../lib/source.mjs"

const databaseRow = {
  as_of_trade_date: "2026-08-05",
  source_generated_at: "2026-08-05T19:31:14.469373+08:00",
  signal_level: 1,
  signal_label: "弱多",
}

test("database rows map directly to the five public states", () => {
  assert.deepEqual(normalizeSignalRow(databaseRow), {
    asOfTradeDate: "2026-08-05",
    sourceGeneratedAt: "2026-08-05T19:31:14.469373+08:00",
    signalLevel: 1,
    signalLabel: "弱多",
  })
  assert.throws(() => normalizeSignalRow({ ...databaseRow, signal_label: "强多" }), /level.*label/i)
})

test("the source reader uses a read-only transaction and fails closed on stale data", async () => {
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (/SELECT/i.test(sql)) return { rows: [databaseRow] }
      return { rows: [] }
    },
  }

  const signal = await fetchLatestSignal(client, { expectedAsOfDate: "2026-08-05" })
  assert.equal(signal.signalLabel, "弱多")
  assert.equal(queries[0], "BEGIN READ ONLY")
  assert.match(queries[1], /public\.micro_timing_final_tail_hold_dates/)
  assert.equal(queries.at(-1), "ROLLBACK")

  await assert.rejects(fetchLatestSignal(client, { expectedAsOfDate: "2026-08-06" }), /fresh signal/i)
})

test("the source reader rolls back when validation fails", async () => {
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (/SELECT/i.test(sql)) return { rows: [{ ...databaseRow, signal_level: 9 }] }
      return { rows: [] }
    },
  }

  await assert.rejects(fetchLatestSignal(client, { expectedAsOfDate: "2026-08-05" }), /signal level/i)
  assert.equal(queries.at(-1), "ROLLBACK")
})
