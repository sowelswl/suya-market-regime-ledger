import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

async function readJsonTree(directory) {
  const values = []

  async function walk(current) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch (error) {
      if (error?.code === "ENOENT") return
      throw error
    }

    for (const entry of entries) {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(target)
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        values.push(JSON.parse(await readFile(target, "utf8")))
      }
    }
  }

  await walk(directory)
  return values
}

async function readOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

async function readOptionalJsonLines(file) {
  try {
    const contents = (await readFile(file, "utf8")).trim()
    return contents ? contents.split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

export async function buildSiteData(root) {
  const [commitments, reveals, historicalEvaluation, corrections] = await Promise.all([
    readJsonTree(path.join(root, "commitments")),
    readJsonTree(path.join(root, "reveals")),
    readOptionalJson(path.join(root, "evaluation/public/history.json")),
    readOptionalJsonLines(path.join(root, "corrections/corrections.jsonl")),
  ])
  const revealsByDate = new Map(reveals.map((reveal) => [reveal.as_of_trade_date, reveal]))
  const correctionsByCommitment = new Map()
  for (const correction of corrections) {
    const key = `${correction.as_of_trade_date}:${correction.original_commitment}`
    const values = correctionsByCommitment.get(key) ?? []
    values.push(correction)
    correctionsByCommitment.set(key, values)
  }
  commitments.sort((left, right) => right.sequence - left.sequence)

  return {
    schema_version: "1.0",
    generated_at: commitments[0]?.committed_at ?? null,
    source_repository: "https://github.com/sowelswl/suya-market-regime-ledger",
    privacy: {
      public_signal_window: 20,
      raw_historical_signals_published: false,
    },
    historical_evaluation: historicalEvaluation,
    records: commitments.slice(0, 20).map((commitment) => ({
        commitment,
        reveal: revealsByDate.get(commitment.as_of_trade_date) ?? null,
        corrections: correctionsByCommitment.get(`${commitment.as_of_trade_date}:${commitment.commitment}`) ?? [],
      })),
  }
}
