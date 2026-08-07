const HISTORICAL_EVALUATION_QUERY = `
  WITH ordered_observations AS (
    SELECT
      trade_date::text AS as_of_trade_date,
      generated_at AS source_generated_at,
      trend5mcx_signal_level,
      trend5mcx_signal_label,
      LEAD(csi500_return) OVER (ORDER BY trade_date) AS next_csi500_return,
      LEAD(hs300_return) OVER (ORDER BY trade_date) AS next_hs300_return
    FROM public.micro_timing_final_tail_hold_dates
  )
  SELECT
    as_of_trade_date,
    source_generated_at,
    trend5mcx_signal_level::int AS signal_level,
    trend5mcx_signal_label AS signal_label,
    next_csi500_return,
    next_hs300_return
  FROM ordered_observations
  WHERE trend5mcx_signal_level IS NOT NULL
    AND next_csi500_return IS NOT NULL
    AND next_hs300_return IS NOT NULL
  ORDER BY as_of_trade_date
`

export async function fetchHistoricalEvaluationRows(client) {
  await client.query("BEGIN READ ONLY")
  try {
    const result = await client.query(HISTORICAL_EVALUATION_QUERY)
    return result.rows
  } finally {
    await client.query("ROLLBACK")
  }
}
