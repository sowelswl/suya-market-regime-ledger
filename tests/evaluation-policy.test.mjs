import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("evaluation v1 remains available as the original audit artifact", async () => {
  const [policySource, originalMethodology] = await Promise.all([
    read("evaluation/v1.json"),
    read("EVALUATION_V1.md"),
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
  assert.match(originalMethodology, /每日评价/)
  assert.match(originalMethodology, /完整状态区间评价/)
  assert.match(originalMethodology, /000905/)
  assert.match(originalMethodology, /不[^\n]*胜率|不发布[^\n]*胜率/)
})

test("the frozen evaluation policy is included in external attestation", async () => {
  const workflow = await read(".github/workflows/attest.yml")

  assert.match(workflow, /evaluation\/v1\.json/)
  assert.match(workflow, /EVALUATION_V1\.md/)
})

test("evaluation v1.1 corrects the signal to one-day broad-market direction with long-biased exposure", async () => {
  const [policySource, methodology, readme, correction] = await Promise.all([
    read("evaluation/v1.1.json"),
    read("EVALUATION_V1_1.md"),
    read("README.md"),
    read("CORRECTIONS.md"),
  ])
  const policy = JSON.parse(policySource)

  assert.equal(policy.version, "1.1.0")
  assert.equal(policy.previous_version, "1.0.0")
  assert.equal(policy.status, "frozen")
  assert.equal(policy.scope.market, "broad_market_indices")
  assert.equal(policy.benchmark.primary.index_code, "000905")
  assert.deepEqual(policy.daily.horizons_in_trading_days, [1])
  assert.equal(policy.daily.return_formula, "close[t+1] / close[t] - 1")
  assert.deepEqual(policy.daily.bullish_levels, [0, 1, 2])
  assert.deepEqual(policy.daily.bearish_levels, [-2, -1])
  assert.equal(policy.exposure.overall_bias, "right_skewed_long")
  assert.equal(policy.exposure.levels["0"], "very_light_long")
  assert.equal(policy.exposure.levels["-1"], "reduced_long_no_default_short")
  assert.equal(policy.exposure.levels["-2"], "near_zero_or_slight_short")
  assert.equal(policy.interval_analysis.role, "descriptive_only_not_signal_score")
  assert.equal("neutral_band" in policy.daily, false)
  assert.match(methodology, /只预测[^\n]*下一[^\n]*交易日/)
  assert.match(methodology, /宽基|大盘/)
  assert.match(methodology, /看平[^\n]*轻微多头/)
  assert.match(methodology, /强空[^\n]*轻微[^\n]*空头/)
  assert.match(readme, /EVALUATION_V1_1\.md/)
  assert.doesNotMatch(readme, /1\/2\/3/)
  assert.match(correction, /1\.0\.0[\s\S]*1\.1\.0/)
})

test("evaluation v1.1 is included in external attestation without deleting v1", async () => {
  const workflow = await read(".github/workflows/attest.yml")

  assert.match(workflow, /evaluation\/v1\.json/)
  assert.match(workflow, /evaluation\/v1\.1\.json/)
  assert.match(workflow, /EVALUATION_V1\.md/)
  assert.match(workflow, /EVALUATION_V1_1\.md/)
  assert.match(workflow, /CORRECTIONS\.md/)
})
