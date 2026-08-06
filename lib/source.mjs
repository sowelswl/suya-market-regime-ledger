import { assertAsOfTradeDate, assertSignal } from "./ledger.mjs"

const SIGNAL_QUERY = `
  SELECT
    trade_date::text AS as_of_trade_date,
    generated_at AS source_generated_at,
    trend5mcx_signal_level::int AS signal_level,
    trend5mcx_signal_label AS signal_label
  FROM public.micro_timing_final_tail_hold_dates
  WHERE trend5mcx_signal_level IS NOT NULL
  ORDER BY trade_date DESC
  LIMIT 1
`

function normalizeTimestamp(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== "string") throw new TypeError("Source generated timestamp is required")
  return value.replace(" ", "T")
}

export function normalizeSignalRow(row) {
  const asOfTradeDate = row?.as_of_trade_date
  const sourceGeneratedAt = normalizeTimestamp(row?.source_generated_at)
  const signalLevel = Number(row?.signal_level)
  const signalLabel = row?.signal_label

  assertAsOfTradeDate(asOfTradeDate)
  assertSignal(signalLevel, signalLabel)

  return { asOfTradeDate, sourceGeneratedAt, signalLevel, signalLabel }
}

export async function fetchLatestSignal(client, { expectedAsOfDate }) {
  assertAsOfTradeDate(expectedAsOfDate)
  await client.query("BEGIN READ ONLY")

  try {
    const result = await client.query(SIGNAL_QUERY)
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
