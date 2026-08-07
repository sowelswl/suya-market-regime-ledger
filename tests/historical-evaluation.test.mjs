import assert from "node:assert/strict"
import test from "node:test"

import { buildHistoricalEvaluation } from "../lib/historical-evaluation.mjs"
import { fetchHistoricalEvaluationRows } from "../lib/historical-source.mjs"

const states = [
  { level: -2, label: "强空", nextReturn: -0.02 },
  { level: -1, label: "弱空", nextReturn: 0.01 },
  { level: 0, label: "看平", nextReturn: 0.005 },
  { level: 1, label: "弱多", nextReturn: -0.01 },
  { level: 2, label: "强多", nextReturn: 0.02 },
]

function sampleRows() {
  return states.flatMap((state, stateIndex) => Array.from({ length: 10 }, (_, index) => ({
    as_of_trade_date: `2025-${String(stateIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
    signal_level: state.level,
    signal_label: state.label,
    next_csi500_return: state.nextReturn,
    next_hs300_return: state.nextReturn / 2,
  })))
}

test("historical evaluation publishes aggregate next-session evidence without the daily signal sequence", () => {
  const report = buildHistoricalEvaluation(sampleRows(), {
    generatedAt: "2026-08-07T08:00:00+08:00",
  })

  assert.equal(report.policy_version, "1.1.0")
  assert.match(report.source_snapshot.signal_source, /jq_time_series_signal_daily/)
  assert.match(report.source_snapshot.market_return_source, /csi500_return,hs300_return/)
  assert.equal(report.privacy.public_signal_window, 20)
  assert.equal(report.privacy.raw_historical_signals_published, false)
  assert.equal(report.scope.observations, 50)
  assert.equal(report.benchmarks.csi500.overall.direction_hit_rate, 0.6)
  assert.equal(report.benchmarks.csi500.by_state.find((state) => state.level === 0).direction_hit_rate, 1)
  assert.equal(report.benchmarks.csi500.by_state.find((state) => state.level === -1).direction_hit_rate, 0)
  assert.deepEqual(report.benchmarks.csi500.by_state.map((state) => state.level), [-2, -1, 0, 1, 2])
  assert.equal(report.benchmarks.csi500.state_ordering.fully_monotonic, false)
  assert.match(report.source_snapshot.sha256, /^[a-f0-9]{64}$/)

  const publicJson = JSON.stringify(report)
  assert.doesNotMatch(publicJson, /as_of_trade_date|next_csi500_return|next_hs300_return/)
  assert.equal("records" in report, false)
})

test("historical source joins separately read-only signal and market-return sources", async () => {
  const signalQueries = []
  const marketQueries = []
  const signalClient = {
    async query(sql, values) {
      signalQueries.push({ sql, values })
      if (/jq_time_series_signal_daily/i.test(sql)) {
        return { rows: sampleRows().map(({ next_csi500_return, next_hs300_return, ...row }) => row) }
      }
      return { rows: [] }
    },
  }
  const marketClient = {
    async query(sql) {
      marketQueries.push(sql)
      if (/WITH ordered_observations/i.test(sql)) {
        return { rows: sampleRows().map(({ signal_level, signal_label, ...row }) => row) }
      }
      return { rows: [] }
    },
  }

  const rows = await fetchHistoricalEvaluationRows(signalClient, marketClient)

  assert.equal(rows.length, 50)
  assert.equal(signalQueries[0].sql, "BEGIN READ ONLY")
  assert.match(signalQueries[1].sql, /public\.jq_time_series_signal_daily/i)
  assert.deepEqual(signalQueries[1].values, [
    "ret_trend_lev_ma_5level_calendar",
    "98bc3197708958de",
    "IC.CFE",
  ])
  assert.equal(signalQueries.at(-1).sql, "ROLLBACK")
  assert.equal(marketQueries[0], "BEGIN READ ONLY")
  assert.match(marketQueries[1], /LEAD\(csi500_return\)/i)
  assert.match(marketQueries[1], /LEAD\(hs300_return\)/i)
  assert.equal(marketQueries.at(-1), "ROLLBACK")
})

test("historical database entry point separates signal_db from aistk market returns", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => (
    readFile(new URL("../bin/build-historical-evaluation-from-database.mjs", import.meta.url), "utf8")
  ))

  assert.match(source, /database:\s*"signal_db"/)
  assert.match(source, /database:\s*"aistk"/)
  assert.match(source, /fetchHistoricalEvaluationRows\(signalClient, marketClient\)/)
})
