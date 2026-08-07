import { createHash } from "node:crypto"

import { canonicalize } from "./canonical.mjs"
import { SIGNAL_LEVELS, SOURCE_NAME, assertSignal } from "./ledger.mjs"

const BENCHMARKS = Object.freeze({
  csi500: { label: "中证500", returnField: "next_csi500_return", role: "primary" },
  hs300: { label: "沪深300", returnField: "next_hs300_return", role: "secondary" },
  csi1000: { label: "中证1000", returnField: "next_csi1000_return", role: "secondary" },
  csi2000: { label: "中证2000", returnField: "next_csi2000_return", role: "secondary" },
  sse_composite: { label: "上证指数", returnField: "next_sse_composite_return", role: "secondary" },
})
const ORDERED_LEVELS = Object.freeze([-2, -1, 0, 1, 2])

function round(value, digits = 8) {
  return Number(value.toFixed(digits))
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function directionHit(level, realizedReturn) {
  return level >= 0 ? realizedReturn > 0 : realizedReturn < 0
}

function summarize(rows, returnField) {
  const returns = rows.map((row) => row[returnField])
  const hits = rows.filter((row) => directionHit(row.signal_level, row[returnField])).length
  return {
    observations: rows.length,
    direction_hits: hits,
    direction_hit_rate: round(hits / rows.length),
    mean_next_day_return: round(mean(returns)),
    median_next_day_return: round(median(returns)),
  }
}

function stateSummaries(rows, returnField) {
  return ORDERED_LEVELS.map((level) => {
    const label = SIGNAL_LEVELS[String(level)]
    const stateRows = rows.filter((row) => row.signal_level === level)
    if (stateRows.length < 10) {
      return {
        level,
        label,
        observations: stateRows.length,
        published: false,
        suppression_reason: "fewer_than_10_observations",
      }
    }
    return { level, label, published: true, ...summarize(stateRows, returnField) }
  })
}

function annualSummaries(rows, returnField) {
  const byYear = new Map()
  for (const row of rows) {
    const year = row.as_of_trade_date.slice(0, 4)
    const values = byYear.get(year) ?? []
    values.push(row)
    byYear.set(year, values)
  }
  return [...byYear.entries()].map(([year, yearRows]) => (
    yearRows.length >= 20
      ? { year: Number(year), published: true, ...summarize(yearRows, returnField) }
      : {
          year: Number(year),
          observations: yearRows.length,
          published: false,
          suppression_reason: "fewer_than_20_observations",
        }
  ))
}

function ordering(byState) {
  const published = byState.filter((state) => state.published)
  if (published.length !== 5) return { published: false, reason: "not_all_states_have_10_observations" }
  let orderedPairs = 0
  for (let index = 1; index < published.length; index += 1) {
    if (published[index - 1].mean_next_day_return < published[index].mean_next_day_return) orderedPairs += 1
  }
  return {
    published: true,
    ordered_adjacent_pairs: orderedPairs,
    total_adjacent_pairs: 4,
    fully_monotonic: orderedPairs === 4,
  }
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const signalLevel = Number(row.signal_level)
    assertSignal(signalLevel, row.signal_label)
    const normalizedReturns = {}
    for (const benchmark of Object.values(BENCHMARKS)) {
      const value = Number(row[benchmark.returnField])
      if (!Number.isFinite(value)) {
        throw new TypeError("Historical evaluation requires finite next-session returns")
      }
      normalizedReturns[benchmark.returnField] = value
    }
    return {
      as_of_trade_date: row.as_of_trade_date,
      source_generated_at: row.source_generated_at instanceof Date
        ? row.source_generated_at.toISOString()
        : (row.source_generated_at ?? null),
      signal_level: signalLevel,
      signal_label: row.signal_label,
      ...normalizedReturns,
    }
  }).sort((left, right) => left.as_of_trade_date.localeCompare(right.as_of_trade_date))
}

export function buildHistoricalEvaluation(sourceRows, { generatedAt = new Date().toISOString() } = {}) {
  const rows = normalizeRows(sourceRows)
  if (rows.length === 0) throw new Error("Historical evaluation requires at least one complete observation")
  const snapshot = createHash("sha256").update(canonicalize(rows)).digest("hex")
  const benchmarks = {}

  for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
    const byState = stateSummaries(rows, benchmark.returnField)
    benchmarks[key] = {
      label: benchmark.label,
      role: benchmark.role,
      overall: summarize(rows, benchmark.returnField),
      state_ordering: ordering(byState),
      by_state: byState,
      by_year: annualSummaries(rows, benchmark.returnField),
    }
  }

  return {
    schema_version: "1.0",
    policy_version: "1.2.0",
    generated_at: generatedAt,
    methodology: "next_trading_session_direction",
    retrospective: true,
    privacy: {
      public_signal_window: 20,
      raw_historical_signals_published: false,
      daily_sequence_published: false,
    },
    scope: {
      first_signal_date: rows[0].as_of_trade_date,
      last_evaluated_signal_date: rows.at(-1).as_of_trade_date,
      observations: rows.length,
    },
    source_snapshot: {
      signal_source: SOURCE_NAME,
      market_return_source: "aistk.public.micro_timing_final_tail_hold_dates:csi500_return,hs300_return;cn_stock_db.public.cn_stock_index_price_daily_wind:000001.SH,000852.SH,932000.CSI",
      algorithm: "sha256",
      sha256: snapshot,
      raw_rows_public: false,
    },
    benchmarks,
    limitations: [
      "historical_rows_are_retrospective_and_not_prospective_commitments",
      "position_sizes_are_not_evaluated_without_a_frozen_numeric_mapping",
    ],
  }
}
