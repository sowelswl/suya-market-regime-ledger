import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { assertSignalDate, createLedgerEntry, verifyReveal } from "./ledger.mjs"

function datedPath(root, collection, signalDate) {
  const [year, month] = signalDate.split("-")
  return path.join(root, collection, year, month, `${signalDate}.json`)
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

async function writeJsonExclusive(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })

  try {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Ledger file already exists: ${filePath}`)
    throw error
  }
}

export async function prepareSignalFiles(root, input) {
  const { commitment, reveal } = createLedgerEntry(input)
  const commitmentPath = datedPath(root, "commitments", input.signalDate)
  const privateRevealPath = path.join(root, "private", "pending", `${input.signalDate}.json`)

  await Promise.all([assertAvailable(commitmentPath), assertAvailable(privateRevealPath)])
  await writeJsonExclusive(privateRevealPath, reveal)
  await writeJsonExclusive(commitmentPath, commitment)

  return { commitmentPath, privateRevealPath, commitment }
}

export async function publishReveal(root, signalDate) {
  assertSignalDate(signalDate)
  const commitmentPath = datedPath(root, "commitments", signalDate)
  const privateRevealPath = path.join(root, "private", "pending", `${signalDate}.json`)
  const revealPath = datedPath(root, "reveals", signalDate)

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
  assertSignalDate(record?.signal_date)
  if (typeof record?.recorded_at !== "string" || Number.isNaN(Date.parse(record.recorded_at))) {
    throw new TypeError("Correction recorded_at must be a valid timestamp")
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(record?.original_commitment ?? "")) {
    throw new TypeError("Correction must retain the original commitment")
  }
  if (typeof record?.reason !== "string" || record.reason.trim() === "") {
    throw new TypeError("Correction reason is required")
  }
  if (!['invalidate', 'clarify'].includes(record?.action)) {
    throw new TypeError("Correction action must be invalidate or clarify")
  }

  const correctionPath = path.join(root, "corrections", "corrections.jsonl")
  await mkdir(path.dirname(correctionPath), { recursive: true })
  await appendFile(correctionPath, `${JSON.stringify(record)}\n`, "utf8")
  return { correctionPath }
}
