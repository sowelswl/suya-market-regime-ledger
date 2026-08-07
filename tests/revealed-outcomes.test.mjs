import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { buildRevealedOutcomes } from "../lib/revealed-outcomes.mjs"

test("revealed outcomes publish five next-session index returns without embedding signal history", () => {
  const report = buildRevealedOutcomes([
    {
      as_of_trade_date: "2026-08-05",
      outcome_trade_date: "2026-08-06",
      next_csi500_return: 0.0123,
      next_hs300_return: 0.0098,
      next_csi1000_return: 0.0142,
      next_csi2000_return: 0.0161,
      next_sse_composite_return: 0.0087,
    },
    {
      as_of_trade_date: "2026-08-06",
      outcome_trade_date: "2026-08-07",
      next_csi500_return: -0.01,
      next_hs300_return: -0.008,
      next_csi1000_return: -0.012,
      next_csi2000_return: -0.013,
      next_sse_composite_return: -0.006,
    },
  ], ["2026-08-05"], { generatedAt: "2026-08-08T08:00:00+08:00" })

  assert.equal(report.schema_version, "1.0")
  assert.equal(report.methodology, "next_trading_session_price_return")
  assert.equal(report.records.length, 1)
  assert.equal(report.records[0].as_of_trade_date, "2026-08-05")
  assert.equal(report.records[0].outcome_trade_date, "2026-08-06")
  assert.deepEqual(Object.keys(report.records[0].benchmarks), [
    "csi500",
    "hs300",
    "csi1000",
    "csi2000",
    "sse_composite",
  ])
  assert.equal(report.records[0].benchmarks.sse_composite.label, "上证指数")
  assert.equal(report.records[0].benchmarks.csi2000.return, 0.0161)
  assert.equal(report.after_the_fact, true)
  assert.doesNotMatch(JSON.stringify(report), /signal_level|signal_label|nonce/)
})

test("revealed outcomes reject missing dates and non-finite market returns", () => {
  assert.throws(() => buildRevealedOutcomes([], ["2026-08-05"]), /missing/i)
  assert.throws(() => buildRevealedOutcomes([{
    as_of_trade_date: "2026-08-05",
    outcome_trade_date: "2026-08-06",
    next_csi500_return: Number.NaN,
    next_hs300_return: 0,
    next_csi1000_return: 0,
    next_csi2000_return: 0,
    next_sse_composite_return: 0,
  }], ["2026-08-05"]), /finite/)
})

test("revealed outcome entry point reads only the two market databases", async () => {
  const source = await readFile(new URL("../bin/build-revealed-outcomes-from-database.mjs", import.meta.url), "utf8")

  assert.match(source, /database:\s*"aistk"/)
  assert.match(source, /database:\s*"cn_stock_db"/)
  assert.doesNotMatch(source, /database:\s*"signal_db"/)
  assert.match(source, /fetchNextSessionReturns\(marketClient, indexClient\)/)
  assert.match(source, /reveals/)
})
