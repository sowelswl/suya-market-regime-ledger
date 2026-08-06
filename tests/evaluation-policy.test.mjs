import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("evaluation v1 freezes a reproducible daily and regime-interval scorecard", async () => {
  const [policySource, methodology, readme] = await Promise.all([
    read("evaluation/v1.json"),
    read("EVALUATION_V1.md"),
    read("README.md"),
  ])
  const policy = JSON.parse(policySource)

  assert.equal(policy.policy_id, "suya-market-regime-evaluation")
  assert.equal(policy.version, "1.0.0")
  assert.equal(policy.status, "frozen")
  assert.equal(policy.effective_from, "2026-08-07")
  assert.equal(policy.target.index_code, "000905")
  assert.equal(policy.target.price_field, "official_close")
  assert.deepEqual(policy.daily.horizons_in_trading_days, [1, 2, 3])
  assert.equal(policy.daily.primary_horizon_in_trading_days, 1)
  assert.equal(policy.daily.return_formula, "close[t+h] / close[t] - 1")
  assert.equal(policy.daily.neutral_band.lookback_returns, 20)
  assert.equal(policy.daily.neutral_band.volatility_multiplier, 0.5)
  assert.equal(policy.intervals.grouping, "consecutive_equal_signal_level")
  assert.equal(policy.intervals.open_interval_policy, "exclude_until_closed")
  assert.equal(policy.corrections.original_record_policy, "never_replace")
  assert.equal(policy.reporting.minimum_revealed_records_for_preliminary_summary, 20)
  assert.match(methodology, /每日评价/)
  assert.match(methodology, /完整状态区间评价/)
  assert.match(methodology, /000905/)
  assert.match(methodology, /不[^\n]*胜率|不发布[^\n]*胜率/)
  assert.match(readme, /EVALUATION_V1\.md/)
})

test("the frozen evaluation policy is included in external attestation", async () => {
  const workflow = await read(".github/workflows/attest.yml")

  assert.match(workflow, /evaluation\/v1\.json/)
  assert.match(workflow, /EVALUATION_V1\.md/)
})
