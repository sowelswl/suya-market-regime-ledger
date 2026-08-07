import {
  SIGNAL_LEVELS,
  SOURCE_PARAM_HASH,
  SOURCE_STRATEGY_NAME,
  SOURCE_TICKER,
} from "./ledger.mjs"

const HISTORICAL_SIGNAL_QUERY = `
  SELECT
    date::text AS as_of_trade_date,
    created_at AS source_generated_at,
    prediction::int AS signal_level
  FROM public.jq_time_series_signal_daily
  WHERE strategy_name = $1
    AND param_hash = $2
    AND ticker = $3
    AND prediction IS NOT NULL
  ORDER BY date
`

const MARKET_RETURN_QUERY = `
  WITH ordered_observations AS (
    SELECT
      trade_date::text AS as_of_trade_date,
      LEAD(csi500_return) OVER (ORDER BY trade_date) AS next_csi500_return,
      LEAD(hs300_return) OVER (ORDER BY trade_date) AS next_hs300_return
    FROM public.micro_timing_final_tail_hold_dates
  )
  SELECT
    as_of_trade_date,
    next_csi500_return,
    next_hs300_return
  FROM ordered_observations
  WHERE next_csi500_return IS NOT NULL
    AND next_hs300_return IS NOT NULL
  ORDER BY as_of_trade_date
`

async function readOnlyQuery(client, query, values) {
  await client.query("BEGIN READ ONLY")
  try {
    const result = await client.query(query, values)
    return result.rows
  } finally {
    await client.query("ROLLBACK")
  }
}

export async function fetchHistoricalEvaluationRows(signalClient, marketClient) {
  const [signals, returns] = await Promise.all([
    readOnlyQuery(signalClient, HISTORICAL_SIGNAL_QUERY, [
      SOURCE_STRATEGY_NAME,
      SOURCE_PARAM_HASH,
      SOURCE_TICKER,
    ]),
    readOnlyQuery(marketClient, MARKET_RETURN_QUERY),
  ])
  const returnsByDate = new Map(returns.map((row) => [row.as_of_trade_date, row]))

  return signals.flatMap((signal) => {
    const marketReturn = returnsByDate.get(signal.as_of_trade_date)
    if (!marketReturn) return []
    return [{
      ...signal,
      signal_label: SIGNAL_LEVELS[String(signal.signal_level)],
      next_csi500_return: marketReturn.next_csi500_return,
      next_hs300_return: marketReturn.next_hs300_return,
    }]
  })
}
