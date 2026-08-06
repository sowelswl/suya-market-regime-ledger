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

export async function buildSiteData(root) {
  const [commitments, reveals] = await Promise.all([
    readJsonTree(path.join(root, "commitments")),
    readJsonTree(path.join(root, "reveals")),
  ])
  const revealsByDate = new Map(reveals.map((reveal) => [reveal.as_of_trade_date, reveal]))
  commitments.sort((left, right) => right.sequence - left.sequence)

  return {
    schema_version: "1.0",
    generated_at: commitments[0]?.committed_at ?? null,
    source_repository: "https://github.com/sowelswl/suya-market-regime-ledger",
    records: commitments.map((commitment) => ({
        commitment,
        reveal: revealsByDate.get(commitment.as_of_trade_date) ?? null,
      })),
  }
}
