import { access, readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { prepareSignalFiles, publishReveal } from "./files.mjs"
import { SOURCE_PARAM_HASH, SOURCE_STRATEGY_NAME, SOURCE_TICKER } from "./ledger.mjs"
import { fetchLatestSignal } from "./source.mjs"

async function jsonFiles(root) {
  const files = []

  async function walk(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === "ENOENT") return
      throw error
    }

    for (const entry of entries) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(target)
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target)
    }
  }

  await walk(root)
  return files
}

export async function readChainState(publicRoot) {
  const files = await jsonFiles(path.join(publicRoot, "commitments"))
  const records = await Promise.all(files.map((file) => readFile(file, "utf8").then(JSON.parse)))
  records.sort((left, right) => left.sequence - right.sequence)

  let previous = null
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.sequence !== index + 1 || record.previous_commitment !== previous) {
      throw new Error("Existing public commitment chain is incomplete")
    }
    previous = record.commitment
  }

  return { sequence: records.length + 1, previousCommitment: previous }
}

export async function prepareLatestFromDatabase({
  client,
  publicRoot,
  privateRoot,
  expectedAsOfDate,
  committedAt,
  nonce,
}) {
  const [signal, chain] = await Promise.all([
    fetchLatestSignal(client, { expectedAsOfDate }),
    readChainState(publicRoot),
  ])

  return prepareSignalFiles({
    publicRoot,
    privateRoot,
    input: {
      ...chain,
      ...signal,
      committedAt,
      ...(nonce ? { nonce } : {}),
    },
  })
}

async function laterObservationCount(client, asOfTradeDate) {
  await client.query("BEGIN READ ONLY")
  try {
    const result = await client.query(`
      SELECT count(*)::int AS observation_count
      FROM (
        SELECT date
        FROM public.jq_time_series_signal_daily
        WHERE strategy_name = $2
          AND param_hash = $3
          AND ticker = $4
          AND date > $1::date
        GROUP BY date
        ORDER BY date
        LIMIT 5
      ) observations
    `, [asOfTradeDate, SOURCE_STRATEGY_NAME, SOURCE_PARAM_HASH, SOURCE_TICKER])
    return Number(result.rows[0]?.observation_count ?? 0)
  } finally {
    await client.query("ROLLBACK")
  }
}

export async function publishDueReveals({ client, publicRoot, privateRoot }) {
  const pendingFiles = await jsonFiles(path.join(privateRoot, "pending"))
  const publishedDates = []

  for (const pendingFile of pendingFiles) {
    const reveal = JSON.parse(await readFile(pendingFile, "utf8"))
    const [year, month] = reveal.as_of_trade_date.split("-")
    const publicRevealPath = path.join(publicRoot, "reveals", year, month, `${reveal.as_of_trade_date}.json`)
    try {
      await access(publicRevealPath)
      continue
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }

    if (await laterObservationCount(client, reveal.as_of_trade_date) < 5) continue
    await publishReveal({ publicRoot, privateRoot, asOfTradeDate: reveal.as_of_trade_date })
    publishedDates.push(reveal.as_of_trade_date)
  }

  return publishedDates.sort()
}
