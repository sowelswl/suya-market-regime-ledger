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
      LEAD(trade_date::text) OVER (ORDER BY trade_date) AS outcome_trade_date,
      LEAD(csi500_return) OVER (ORDER BY trade_date) AS next_csi500_return,
      LEAD(hs300_return) OVER (ORDER BY trade_date) AS next_hs300_return
    FROM public.micro_timing_final_tail_hold_dates
  )
  SELECT
    as_of_trade_date,
    outcome_trade_date,
    next_csi500_return,
    next_hs300_return
  FROM ordered_observations
  WHERE next_csi500_return IS NOT NULL
    AND next_hs300_return IS NOT NULL
  ORDER BY as_of_trade_date
`

const INDEX_CODES = Object.freeze(["000001.SH", "000852.SH", "932000.CSI"])
const INDEX_RETURN_QUERY = `
  WITH ordered_prices AS (
    SELECT
      date::text AS as_of_trade_date,
      code,
      LEAD(close / NULLIF(pre_close, 0) - 1) OVER (
        PARTITION BY code
        ORDER BY date
      ) AS next_return
    FROM public.cn_stock_index_price_daily_wind
    WHERE code = ANY($1::text[])
  ), pivoted AS (
    SELECT
      as_of_trade_date,
      MAX(next_return) FILTER (WHERE code = '000852.SH') AS next_csi1000_return,
      MAX(next_return) FILTER (WHERE code = '932000.CSI') AS next_csi2000_return,
      MAX(next_return) FILTER (WHERE code = '000001.SH') AS next_sse_composite_return
    FROM ordered_prices
    GROUP BY as_of_trade_date
  )
  SELECT
    as_of_trade_date,
    next_csi1000_return,
    next_csi2000_return,
    next_sse_composite_return
  FROM pivoted
  WHERE next_csi1000_return IS NOT NULL
    AND next_csi2000_return IS NOT NULL
    AND next_sse_composite_return IS NOT NULL
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

export async function fetchHistoricalEvaluationRows(signalClient, marketClient, indexClient) {
  const [signals, returns] = await Promise.all([
    readOnlyQuery(signalClient, HISTORICAL_SIGNAL_QUERY, [
      SOURCE_STRATEGY_NAME,
      SOURCE_PARAM_HASH,
      SOURCE_TICKER,
    ]),
    fetchNextSessionReturns(marketClient, indexClient),
  ])
  const returnsByDate = new Map(returns.map((row) => [row.as_of_trade_date, row]))

  return signals.flatMap((signal) => {
    const marketReturn = returnsByDate.get(signal.as_of_trade_date)
    if (!marketReturn) return []
    return [{
      ...signal,
      signal_label: SIGNAL_LEVELS[String(signal.signal_level)],
      ...marketReturn,
    }]
  })
}

export async function fetchNextSessionReturns(marketClient, indexClient) {
  const [returns, indexReturns] = await Promise.all([
    readOnlyQuery(marketClient, MARKET_RETURN_QUERY),
    readOnlyQuery(indexClient, INDEX_RETURN_QUERY, [INDEX_CODES]),
  ])
  const indexReturnsByDate = new Map(indexReturns.map((row) => [row.as_of_trade_date, row]))

  return returns.flatMap((marketReturn) => {
    const indexReturn = indexReturnsByDate.get(marketReturn.as_of_trade_date)
    if (!indexReturn) return []
    return [{ ...marketReturn, ...indexReturn }]
  })
}
