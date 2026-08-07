import assert from "node:assert/strict"
import test from "node:test"

import {
  LEGACY_SOURCE_NAME,
  MARKET_STATES,
  SIGNAL_LEVELS,
  SOURCE_NAME,
  createLedgerEntry,
  verifyReveal,
} from "../lib/ledger.mjs"

const base = {
  sequence: 1,
  previousCommitment: null,
  asOfTradeDate: "2026-08-05",
  committedAt: "2026-08-05T20:00:00+08:00",
  sourceGeneratedAt: "2026-08-05T19:31:14+08:00",
  signalLevel: 1,
  signalLabel: "弱多",
  nonce: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
}

test("the ledger maps exactly five database levels to the settled market states", () => {
  assert.deepEqual(MARKET_STATES, ["强空", "弱空", "看平", "弱多", "强多"])
  assert.deepEqual(SIGNAL_LEVELS, {
    "-2": "强空",
    "-1": "弱空",
    "0": "看平",
    "1": "弱多",
    "2": "强多",
  })

  for (const [level, label] of Object.entries(SIGNAL_LEVELS)) {
    assert.doesNotThrow(() => createLedgerEntry({ ...base, signalLevel: Number(level), signalLabel: label }))
  }

  assert.throws(() => createLedgerEntry({ ...base, signalLevel: 1, signalLabel: "强多" }), /level.*label/i)
  assert.throws(() => createLedgerEntry({ ...base, signalLevel: 3, signalLabel: "强多" }), /signal level/i)
})

test("a v2 public commitment hides the state and nonce while the reveal verifies", () => {
  const { commitment, reveal } = createLedgerEntry(base)

  assert.equal(commitment.schema_version, "2.0")
  assert.equal(commitment.as_of_trade_date, base.asOfTradeDate)
  assert.equal(commitment.prediction_horizon, "next_trading_session")
  assert.equal(commitment.canonicalization, "RFC8785-JCS")
  assert.equal(commitment.reveal_after_observations, 5)
  assert.match(commitment.commitment, /^sha256:[a-f0-9]{64}$/)
  assert.equal("signal_level" in commitment, false)
  assert.equal("signal_label" in commitment, false)
  assert.equal("nonce" in commitment, false)
  assert.equal(reveal.signal_level, 1)
  assert.equal(reveal.signal_label, "弱多")
  assert.equal(reveal.nonce, base.nonce)
  assert.match(SOURCE_NAME, /signal_db\.public\.jq_time_series_signal_daily/)
  assert.match(SOURCE_NAME, /ret_trend_lev_ma_5level_calendar/)
  assert.match(SOURCE_NAME, /3\.2/)
  assert.equal(commitment.source, SOURCE_NAME)
  assert.equal(verifyReveal(commitment, reveal), true)
})

test("source migration keeps legacy commitments verifiable without relabeling them", () => {
  const legacy = createLedgerEntry({ ...base, source: LEGACY_SOURCE_NAME })

  assert.match(LEGACY_SOURCE_NAME, /micro_timing_final_tail_hold_dates/)
  assert.equal(legacy.commitment.source, LEGACY_SOURCE_NAME)
  assert.equal(legacy.reveal.source, LEGACY_SOURCE_NAME)
  assert.equal(verifyReveal(legacy.commitment, legacy.reveal), true)
  assert.equal(
    verifyReveal(
      { ...legacy.commitment, source: "unknown.source" },
      { ...legacy.reveal, source: "unknown.source" },
    ),
    false,
  )
})

test("the commitment is deterministic and any material change fails verification", () => {
  const first = createLedgerEntry(base)
  const second = createLedgerEntry(base)

  assert.equal(first.commitment.commitment, second.commitment.commitment)

  for (const changedReveal of [
    { ...first.reveal, signal_level: 2, signal_label: "强多" },
    { ...first.reveal, committed_at: "2026-08-05T20:01:00+08:00" },
    { ...first.reveal, nonce: "f".repeat(64) },
  ]) {
    assert.equal(verifyReveal(first.commitment, changedReveal), false)
  }
})

test("each record links to the previous public commitment", () => {
  const first = createLedgerEntry(base)
  const second = createLedgerEntry({
    ...base,
    sequence: 2,
    previousCommitment: first.commitment.commitment,
    asOfTradeDate: "2026-08-06",
    committedAt: "2026-08-06T20:00:00+08:00",
    sourceGeneratedAt: "2026-08-06T19:35:00+08:00",
  })

  assert.equal(second.commitment.previous_commitment, first.commitment.commitment)
  assert.equal(verifyReveal(second.commitment, second.reveal), true)
  assert.equal(verifyReveal({ ...second.commitment, previous_commitment: null }, second.reveal), false)
  assert.throws(() => createLedgerEntry({ ...base, sequence: 2, previousCommitment: null }), /previous commitment/i)
})

test("input dates, timestamps and nonce must be explicit and well formed", () => {
  assert.throws(() => createLedgerEntry({ ...base, asOfTradeDate: "08/05/2026" }), /trade date/i)
  assert.throws(() => createLedgerEntry({ ...base, committedAt: "2026-08-05" }), /timestamp/i)
  assert.throws(() => createLedgerEntry({ ...base, nonce: "short" }), /nonce/i)
})
