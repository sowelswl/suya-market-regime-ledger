import {
  SIGNAL_LEVELS,
  SOURCE_PARAM_HASH,
  SOURCE_STRATEGY_NAME,
  SOURCE_TICKER,
  assertAsOfTradeDate,
  assertSignal,
} from "./ledger.mjs"

const SIGNAL_QUERY = `
  SELECT
    date::text AS as_of_trade_date,
    created_at AS source_generated_at,
    prediction::int AS signal_level
  FROM public.jq_time_series_signal_daily
  WHERE strategy_name = $1
    AND param_hash = $2
    AND ticker = $3
    AND prediction IS NOT NULL
  ORDER BY date DESC
  LIMIT 1
`

const SOURCE_FILTER = Object.freeze([SOURCE_STRATEGY_NAME, SOURCE_PARAM_HASH, SOURCE_TICKER])

function normalizeTimestamp(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== "string") throw new TypeError("Source generated timestamp is required")
  return value.replace(" ", "T")
}

export function normalizeSignalRow(row) {
  const asOfTradeDate = row?.as_of_trade_date
  const sourceGeneratedAt = normalizeTimestamp(row?.source_generated_at)
  const signalLevel = Number(row?.signal_level)
  const signalLabel = SIGNAL_LEVELS[String(signalLevel)]

  assertAsOfTradeDate(asOfTradeDate)
  assertSignal(signalLevel, signalLabel)

  return { asOfTradeDate, sourceGeneratedAt, signalLevel, signalLabel }
}

export async function fetchLatestSignal(client, { expectedAsOfDate }) {
  assertAsOfTradeDate(expectedAsOfDate)
  await client.query("BEGIN READ ONLY")

  try {
    const result = await client.query(SIGNAL_QUERY, SOURCE_FILTER)
    if (result.rows.length === 0) {
      throw new Error("Configured signal source has no rows")
    }
    if (result.rows.length !== 1) throw new Error("Expected exactly one latest signal row")

    const signal = normalizeSignalRow(result.rows[0])
    if (signal.asOfTradeDate !== expectedAsOfDate) {
      throw new Error(`No fresh signal for expected as-of date ${expectedAsOfDate}`)
    }
    return signal
  } finally {
    await client.query("ROLLBACK")
  }
}
