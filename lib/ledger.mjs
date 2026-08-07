import { createHash, randomBytes } from "node:crypto"

import { canonicalize } from "./canonical.mjs"

export const SIGNAL_LEVELS = Object.freeze({
  "-2": "强空",
  "-1": "弱空",
  "0": "看平",
  "1": "弱多",
  "2": "强多",
})
export const MARKET_STATES = Object.freeze(["强空", "弱空", "看平", "弱多", "强多"])
export const LEGACY_SOURCE_NAME = "aistk.public.micro_timing_final_tail_hold_dates:trend5mcx"
export const SOURCE_STRATEGY_NAME = "ret_trend_lev_ma_5level_calendar"
export const SOURCE_STRATEGY_VERSION = "3.2"
export const SOURCE_PARAM_HASH = "98bc3197708958de"
export const SOURCE_TICKER = "IC.CFE"
export const SOURCE_NAME = `signal_db.public.jq_time_series_signal_daily:${SOURCE_STRATEGY_NAME}@${SOURCE_STRATEGY_VERSION}#${SOURCE_PARAM_HASH}:${SOURCE_TICKER}`

const KNOWN_SOURCE_NAMES = new Set([LEGACY_SOURCE_NAME, SOURCE_NAME])

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const NONCE_PATTERN = /^[a-f0-9]{64}$/

export function assertAsOfTradeDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new TypeError("As-of trade date must use YYYY-MM-DD")
  }
}

function assertTimestamp(value) {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError("Timestamp must be an ISO 8601 value with timezone")
  }
}

export function assertSignal(level, label) {
  if (!Number.isInteger(level) || !(String(level) in SIGNAL_LEVELS)) {
    throw new TypeError("Signal level must be one of -2, -1, 0, 1, 2")
  }
  if (SIGNAL_LEVELS[String(level)] !== label) {
    throw new TypeError("Signal level and label must match")
  }
}

function assertNonce(value) {
  if (typeof value !== "string" || !NONCE_PATTERN.test(value)) {
    throw new TypeError("Nonce must be 32 random bytes encoded as lowercase hexadecimal")
  }
}

function assertChain(sequence, previousCommitment) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new TypeError("Sequence must be a positive integer")
  }
  if (sequence === 1 && previousCommitment !== null) {
    throw new TypeError("The first record must not have a previous commitment")
  }
  if (sequence > 1 && (typeof previousCommitment !== "string" || !DIGEST_PATTERN.test(previousCommitment))) {
    throw new TypeError("A chained record requires a valid previous commitment")
  }
}

function revealPayload({
  sequence,
  previous_commitment,
  as_of_trade_date,
  committed_at,
  source_generated_at,
  signal_level,
  signal_label,
  nonce,
  source,
}) {
  return {
    schema_version: "2.0",
    sequence,
    previous_commitment,
    source,
    as_of_trade_date,
    prediction_horizon: "next_trading_session",
    committed_at,
    source_generated_at,
    signal_level,
    signal_label,
    nonce,
  }
}

function digest(reveal) {
  return createHash("sha256").update(canonicalize(revealPayload(reveal)), "utf8").digest("hex")
}

export function createLedgerEntry({
  sequence,
  previousCommitment,
  asOfTradeDate,
  committedAt,
  sourceGeneratedAt,
  signalLevel,
  signalLabel,
  nonce = randomBytes(32).toString("hex"),
  source = SOURCE_NAME,
}) {
  assertChain(sequence, previousCommitment)
  assertAsOfTradeDate(asOfTradeDate)
  assertTimestamp(committedAt)
  assertTimestamp(sourceGeneratedAt)
  assertSignal(signalLevel, signalLabel)
  assertNonce(nonce)
  if (!KNOWN_SOURCE_NAMES.has(source)) throw new TypeError("Unknown signal source")

  const reveal = revealPayload({
    sequence,
    previous_commitment: previousCommitment,
    as_of_trade_date: asOfTradeDate,
    committed_at: committedAt,
    source_generated_at: sourceGeneratedAt,
    signal_level: signalLevel,
    signal_label: signalLabel,
    nonce,
    source,
  })

  return {
    commitment: {
      schema_version: "2.0",
      sequence,
      previous_commitment: previousCommitment,
      source,
      as_of_trade_date: asOfTradeDate,
      prediction_horizon: "next_trading_session",
      committed_at: committedAt,
      source_generated_at: sourceGeneratedAt,
      reveal_after_observations: 5,
      algorithm: "SHA-256",
      canonicalization: "RFC8785-JCS",
      commitment: `sha256:${digest(reveal)}`,
    },
    reveal,
  }
}

export function verifyReveal(commitment, reveal) {
  try {
    assertChain(reveal?.sequence, reveal?.previous_commitment)
    assertAsOfTradeDate(reveal?.as_of_trade_date)
    assertTimestamp(reveal?.committed_at)
    assertTimestamp(reveal?.source_generated_at)
    assertSignal(reveal?.signal_level, reveal?.signal_label)
    assertNonce(reveal?.nonce)

    if (commitment?.schema_version !== "2.0" || reveal.schema_version !== "2.0") return false
    if (commitment.algorithm !== "SHA-256" || commitment.canonicalization !== "RFC8785-JCS") return false
    if (commitment.source !== reveal.source || !KNOWN_SOURCE_NAMES.has(reveal.source)) return false

    for (const field of [
      "sequence",
      "previous_commitment",
      "as_of_trade_date",
      "prediction_horizon",
      "committed_at",
      "source_generated_at",
    ]) {
      if (commitment[field] !== reveal[field]) return false
    }

    return commitment.commitment === `sha256:${digest(reveal)}`
  } catch {
    return false
  }
}
