import { access, appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { assertAsOfTradeDate, createLedgerEntry, verifyReveal } from "./ledger.mjs"

function datedPath(root, collection, asOfTradeDate) {
  const [year, month] = asOfTradeDate.split("-")
  return path.join(root, collection, year, month, `${asOfTradeDate}.json`)
}

async function assertAvailable(filePath) {
  try {
    await access(filePath)
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  throw new Error(`Ledger file already exists: ${filePath}`)
}

async function writeJsonExclusive(filePath, value, { privateFile = false } = {}) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: privateFile ? 0o700 : 0o755 })
  if (privateFile) await chmod(path.dirname(filePath), 0o700)

  try {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: privateFile ? 0o600 : 0o644,
    })
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Ledger file already exists: ${filePath}`)
    throw error
  }
}

export async function prepareSignalFiles({ publicRoot, privateRoot, input }) {
  const { commitment, reveal } = createLedgerEntry(input)
  const commitmentPath = datedPath(publicRoot, "commitments", input.asOfTradeDate)
  const privateRevealPath = path.join(privateRoot, "pending", `${input.asOfTradeDate}.json`)

  await Promise.all([assertAvailable(commitmentPath), assertAvailable(privateRevealPath)])
  await writeJsonExclusive(privateRevealPath, reveal, { privateFile: true })
  await writeJsonExclusive(commitmentPath, commitment)

  return { commitmentPath, privateRevealPath, commitment }
}

export async function publishReveal({ publicRoot, privateRoot, asOfTradeDate }) {
  assertAsOfTradeDate(asOfTradeDate)
  const commitmentPath = datedPath(publicRoot, "commitments", asOfTradeDate)
  const privateRevealPath = path.join(privateRoot, "pending", `${asOfTradeDate}.json`)
  const revealPath = datedPath(publicRoot, "reveals", asOfTradeDate)

  await assertAvailable(revealPath)
  const [commitment, reveal] = await Promise.all([
    readFile(commitmentPath, "utf8").then(JSON.parse),
    readFile(privateRevealPath, "utf8").then(JSON.parse),
  ])

  if (!verifyReveal(commitment, reveal)) {
    throw new Error("Pending reveal does not match the public commitment")
  }

  await writeJsonExclusive(revealPath, reveal)
  return { revealPath, commitmentPath }
}

export async function appendCorrection(root, record) {
  assertAsOfTradeDate(record?.as_of_trade_date)
  if (typeof record?.recorded_at !== "string" || Number.isNaN(Date.parse(record.recorded_at))) {
    throw new TypeError("Correction recorded_at must be a valid timestamp")
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(record?.original_commitment ?? "")) {
    throw new TypeError("Correction must retain the original commitment")
  }
  if (typeof record?.reason !== "string" || record.reason.trim() === "") {
    throw new TypeError("Correction reason is required")
  }
  if (!["invalidate", "clarify"].includes(record?.action)) {
    throw new TypeError("Correction action must be invalidate or clarify")
  }

  const correctionPath = path.join(root, "corrections", "corrections.jsonl")
  await mkdir(path.dirname(correctionPath), { recursive: true })
  await appendFile(correctionPath, `${JSON.stringify(record)}\n`, "utf8")
  return { correctionPath }
}
