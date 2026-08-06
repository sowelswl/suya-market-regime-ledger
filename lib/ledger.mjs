import { createHash, randomBytes } from "node:crypto"

export const MARKET_STATES = Object.freeze(["强空", "弱空", "看平", "弱多", "强多"])

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
const NONCE_PATTERN = /^[a-f0-9]{64}$/

export function assertSignalDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new TypeError("Signal date must use YYYY-MM-DD")
  }
}

function assertGeneratedAt(value) {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError("Generated timestamp must be an ISO 8601 value with timezone")
  }
}

function assertState(value) {
  if (!MARKET_STATES.includes(value)) {
    throw new TypeError(`Market state must be one of: ${MARKET_STATES.join("、")}`)
  }
}

function assertNonce(value) {
  if (typeof value !== "string" || !NONCE_PATTERN.test(value)) {
    throw new TypeError("Nonce must be 32 random bytes encoded as lowercase hexadecimal")
  }
}

function revealPayload({ signal_date, generated_at, state, nonce }) {
  return {
    schema_version: "1.0",
    signal_date,
    generated_at,
    state,
    nonce,
  }
}

function digest(reveal) {
  return createHash("sha256").update(JSON.stringify(revealPayload(reveal)), "utf8").digest("hex")
}

export function createLedgerEntry({ signalDate, generatedAt, state, nonce = randomBytes(32).toString("hex") }) {
  assertSignalDate(signalDate)
  assertGeneratedAt(generatedAt)
  assertState(state)
  assertNonce(nonce)

  const reveal = revealPayload({
    signal_date: signalDate,
    generated_at: generatedAt,
    state,
    nonce,
  })

  return {
    commitment: {
      schema_version: "1.0",
      signal_date: signalDate,
      generated_at: generatedAt,
      reveal_after_trading_days: 5,
      algorithm: "SHA-256",
      commitment: `sha256:${digest(reveal)}`,
    },
    reveal,
  }
}

export function verifyReveal(commitment, reveal) {
  try {
    assertSignalDate(commitment?.signal_date)
    assertGeneratedAt(commitment?.generated_at)
    assertSignalDate(reveal?.signal_date)
    assertGeneratedAt(reveal?.generated_at)
    assertState(reveal?.state)
    assertNonce(reveal?.nonce)

    if (commitment.schema_version !== "1.0" || reveal.schema_version !== "1.0") return false
    if (commitment.algorithm !== "SHA-256") return false
    if (commitment.signal_date !== reveal.signal_date) return false
    if (commitment.generated_at !== reveal.generated_at) return false

    return commitment.commitment === `sha256:${digest(reveal)}`
  } catch {
    return false
  }
}
