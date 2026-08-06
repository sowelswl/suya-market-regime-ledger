import assert from "node:assert/strict"
import test from "node:test"

import {
  MARKET_STATES,
  createLedgerEntry,
  verifyReveal,
} from "../lib/ledger.mjs"

const base = {
  signalDate: "2026-08-07",
  generatedAt: "2026-08-06T20:00:00+08:00",
  state: "弱多",
  nonce: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
}

test("the ledger accepts exactly the five settled market states", () => {
  assert.deepEqual(MARKET_STATES, ["强空", "弱空", "看平", "弱多", "强多"])

  for (const state of MARKET_STATES) {
    assert.doesNotThrow(() => createLedgerEntry({ ...base, state }))
  }

  assert.throws(() => createLedgerEntry({ ...base, state: "看多" }), /market state/i)
})

test("a public commitment hides the state and nonce while the reveal verifies", () => {
  const { commitment, reveal } = createLedgerEntry(base)

  assert.equal(commitment.schema_version, "1.0")
  assert.equal(commitment.signal_date, base.signalDate)
  assert.equal(commitment.generated_at, base.generatedAt)
  assert.equal(commitment.reveal_after_trading_days, 5)
  assert.match(commitment.commitment, /^sha256:[a-f0-9]{64}$/)
  assert.equal("state" in commitment, false)
  assert.equal("nonce" in commitment, false)
  assert.equal(reveal.state, "弱多")
  assert.equal(reveal.nonce, base.nonce)
  assert.equal(verifyReveal(commitment, reveal), true)
})

test("the commitment is deterministic and any material change fails verification", () => {
  const first = createLedgerEntry(base)
  const second = createLedgerEntry(base)

  assert.equal(first.commitment.commitment, second.commitment.commitment)

  for (const changedReveal of [
    { ...first.reveal, state: "强多" },
    { ...first.reveal, generated_at: "2026-08-06T20:01:00+08:00" },
    { ...first.reveal, nonce: "f".repeat(64) },
  ]) {
    assert.equal(verifyReveal(first.commitment, changedReveal), false)
  }
})

test("input dates and nonce must be explicit and well formed", () => {
  assert.throws(() => createLedgerEntry({ ...base, signalDate: "08/07/2026" }), /signal date/i)
  assert.throws(() => createLedgerEntry({ ...base, generatedAt: "2026-08-06" }), /generated timestamp/i)
  assert.throws(() => createLedgerEntry({ ...base, nonce: "short" }), /nonce/i)
})
