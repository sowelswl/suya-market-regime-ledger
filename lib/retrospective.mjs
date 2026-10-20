import { assertAsOfTradeDate, SOURCE_PARAM_HASH, SOURCE_STRATEGY_NAME, SOURCE_TICKER } from "./ledger.mjs"
import { normalizeSignalRow } from "./source.mjs"

export async function fetchRetrospectiveSignals(client, dates) {
  dates.forEach(assertAsOfTradeDate)
  await client.query("BEGIN READ ONLY")
  try {
    const result = await client.query(`
      SELECT signal.date::text AS as_of_trade_date,
        signal.created_at AS source_generated_at,
        signal.prediction::int AS signal_level,
        (SELECT count(DISTINCT later.date)::int
         FROM public.jq_time_series_signal_daily later
         WHERE later.strategy_name = $1 AND later.param_hash = $2
           AND later.ticker = $3 AND later.date > signal.date) AS later_observations
      FROM public.jq_time_series_signal_daily signal
      WHERE signal.strategy_name = $1 AND signal.param_hash = $2
        AND signal.ticker = $3 AND signal.date = ANY($4::date[])
      ORDER BY signal.date
    `, [SOURCE_STRATEGY_NAME, SOURCE_PARAM_HASH, SOURCE_TICKER, dates])
    return result.rows
  } finally {
    await client.query("ROLLBACK")
  }
}

export function buildRetrospectiveSignals(rows, manifest, { cutoffDate = null } = {}) {
  if (typeof manifest.recorded_at !== "string" || Number.isNaN(Date.parse(manifest.recorded_at))) {
    throw new TypeError("Recording timestamp is required")
  }
  manifest.dates.forEach(assertAsOfTradeDate)
  const expected = new Set(manifest.dates)
  const seen = new Set()
  const records = rows.map((row) => {
    if (!expected.has(row.as_of_trade_date)) throw new Error("Unexpected retrospective source date")
    if (seen.has(row.as_of_trade_date)) throw new Error("Duplicate retrospective source date")
    seen.add(row.as_of_trade_date)
    if (row.signal_level === null || row.signal_level === undefined) throw new TypeError("Missing signal")
    const signal = normalizeSignalRow(row)
    const later = Number(row.later_observations)
    if (!Number.isInteger(later) || later < 0) throw new TypeError("Invalid observation count")
    return {
      as_of_trade_date: signal.asOfTradeDate,
      source_generated_at: signal.sourceGeneratedAt,
      status: later >= 5 ? "retrospective" : "awaiting_observations",
      ...(later >= 5 ? { signal_level: signal.signalLevel, signal_label: signal.signalLabel } : {}),
    }
  })
  if ([...expected].some((date) => !seen.has(date))) throw new Error("Missing retrospective source date")
  return {
    schema_version: "1.0",
    after_the_fact: true,
    prospective_evidence: false,
    recorded_at: manifest.recorded_at,
    records: records.filter((row) => !cutoffDate || row.as_of_trade_date >= cutoffDate)
      .sort((a, b) => b.as_of_trade_date.localeCompare(a.as_of_trade_date)),
  }
}
