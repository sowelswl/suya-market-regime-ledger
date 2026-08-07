import { readdir, readFile, rm } from "node:fs/promises"
import path from "node:path"

async function jsonFiles(directory) {
  const files = []
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
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target)
    }
  }
  await walk(directory)
  return files
}

export async function prunePublicReveals(publicRoot, { windowSize = 20 } = {}) {
  if (!Number.isInteger(windowSize) || windowSize < 1) throw new TypeError("Window size must be positive")
  const commitmentFiles = await jsonFiles(path.join(publicRoot, "commitments"))
  const commitments = await Promise.all(commitmentFiles.map(async (file) => JSON.parse(await readFile(file, "utf8"))))
  commitments.sort((left, right) => right.sequence - left.sequence)
  const visibleDates = new Set(commitments.slice(0, windowSize).map((item) => item.as_of_trade_date))

  const revealFiles = await jsonFiles(path.join(publicRoot, "reveals"))
  const removed = []
  for (const file of revealFiles) {
    const reveal = JSON.parse(await readFile(file, "utf8"))
    if (visibleDates.has(reveal.as_of_trade_date)) continue
    await rm(file)
    removed.push(reveal.as_of_trade_date)
  }
  return removed.sort()
}
