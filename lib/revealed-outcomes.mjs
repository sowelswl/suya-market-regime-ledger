const BENCHMARKS = Object.freeze({
  csi500: { label: "中证500", returnField: "next_csi500_return" },
  hs300: { label: "沪深300", returnField: "next_hs300_return" },
  csi1000: { label: "中证1000", returnField: "next_csi1000_return" },
  csi2000: { label: "中证2000", returnField: "next_csi2000_return" },
  sse_composite: { label: "上证指数", returnField: "next_sse_composite_return" },
})

function round(value) {
  return Number(value.toFixed(8))
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new TypeError(`${label} must be YYYY-MM-DD`)
  }
}

export function buildRevealedOutcomes(rows, revealedDates, { generatedAt = new Date().toISOString() } = {}) {
  const visibleDates = new Set(revealedDates)
  const records = rows
    .filter((row) => visibleDates.has(row.as_of_trade_date))
    .map((row) => {
      assertDate(row.as_of_trade_date, "as_of_trade_date")
      assertDate(row.outcome_trade_date, "outcome_trade_date")
      const benchmarks = {}
      for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
        const value = Number(row[benchmark.returnField])
        if (!Number.isFinite(value)) throw new TypeError("Revealed outcomes require finite market returns")
        benchmarks[key] = { label: benchmark.label, return: round(value) }
      }
      return {
        as_of_trade_date: row.as_of_trade_date,
        outcome_trade_date: row.outcome_trade_date,
        benchmarks,
      }
    })
    .sort((left, right) => right.as_of_trade_date.localeCompare(left.as_of_trade_date))
  const matchedDates = new Set(records.map((record) => record.as_of_trade_date))
  const missingDates = [...visibleDates].filter((date) => !matchedDates.has(date))
  if (missingDates.length > 0) {
    throw new Error(`Missing next-session market outcomes for: ${missingDates.join(", ")}`)
  }

  return {
    schema_version: "1.0",
    generated_at: generatedAt,
    methodology: "next_trading_session_price_return",
    after_the_fact: true,
    source: "aistk+cn_stock_db",
    records,
  }
}
