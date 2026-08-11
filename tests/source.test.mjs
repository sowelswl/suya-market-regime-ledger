import assert from "node:assert/strict"
import test from "node:test"

import { fetchLatestSignal, normalizeSignalRow } from "../lib/source.mjs"

const databaseRow = {
  as_of_trade_date: "2026-08-05",
  source_generated_at: "2026-08-05T11:05:36.340990+08:00",
  signal_level: 1,
}

test("database rows map directly to the five public states", () => {
  assert.deepEqual(normalizeSignalRow(databaseRow), {
    asOfTradeDate: "2026-08-05",
    sourceGeneratedAt: "2026-08-05T11:05:36.340990+08:00",
    signalLevel: 1,
    signalLabel: "弱多",
  })
  assert.throws(() => normalizeSignalRow({ ...databaseRow, signal_level: 9 }), /signal level/i)
})

test("the source reader uses a read-only transaction and fails closed on stale data", async () => {
  const queries = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (/SELECT/i.test(sql)) return { rows: [databaseRow] }
      return { rows: [] }
    },
  }

  const signal = await fetchLatestSignal(client, { expectedAsOfDate: "2026-08-05" })
  assert.equal(signal.signalLabel, "弱多")
  assert.equal(queries[0].sql, "BEGIN READ ONLY")
  assert.match(queries[1].sql, /public\.jq_time_series_signal_daily/)
  assert.match(queries[1].sql, /strategy_name\s*=\s*\$1/)
  assert.match(queries[1].sql, /param_hash\s*=\s*\$2/)
  assert.match(queries[1].sql, /ticker\s*=\s*\$3/)
  assert.deepEqual(queries[1].values, [
    "ret_trend_lev_ma_5level_calendar",
    "98bc3197708958de",
    "IC.CFE",
  ])
  assert.equal(queries.at(-1).sql, "ROLLBACK")

  await assert.rejects(fetchLatestSignal(client, { expectedAsOfDate: "2026-08-06" }), /fresh signal/i)
})

test("the source reader rolls back when validation fails", async () => {
  const queries = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (/SELECT/i.test(sql)) return { rows: [{ ...databaseRow, signal_level: 9 }] }
      return { rows: [] }
    },
  }

  await assert.rejects(fetchLatestSignal(client, { expectedAsOfDate: "2026-08-05" }), /signal level/i)
  assert.equal(queries.at(-1).sql, "ROLLBACK")
})

test("the source reader explains when the configured signal source has no rows", async () => {
  const client = {
    async query(sql) {
      if (/SELECT/i.test(sql)) return { rows: [] }
      return { rows: [] }
    },
  }

  await assert.rejects(
    fetchLatestSignal(client, { expectedAsOfDate: "2026-08-11" }),
    /configured signal source has no rows/i,
  )
})
