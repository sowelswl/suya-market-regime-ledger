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

test("historical source reads signals and next-trading-day returns in one read-only transaction", async () => {
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (/WITH ordered_observations/i.test(sql)) return { rows: sampleRows() }
      return { rows: [] }
    },
  }

  const rows = await fetchHistoricalEvaluationRows(client)

  assert.equal(rows.length, 50)
  assert.equal(queries[0], "BEGIN READ ONLY")
  assert.match(queries[1], /LEAD\(csi500_return\)/i)
  assert.match(queries[1], /LEAD\(hs300_return\)/i)
  assert.match(queries[1], /trend5mcx_signal_level IS NOT NULL/i)
  assert.equal(queries.at(-1), "ROLLBACK")
})
