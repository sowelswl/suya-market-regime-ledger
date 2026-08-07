#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

import { fetchNextSessionReturns } from "../lib/historical-source.mjs"
import { buildRevealedOutcomes } from "../lib/revealed-outcomes.mjs"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function revealDates(directory) {
  const dates = []
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
        const reveal = JSON.parse(await readFile(target, "utf8"))
        dates.push(reveal.as_of_trade_date)
      }
    }
  }
  await walk(directory)
  return dates
}

async function main() {
  const root = process.cwd()
  const output = path.join(root, "evaluation/public/revealed-outcomes.json")
  const common = {
    host: requiredEnv("PG_NAS_HOST"),
    port: Number(requiredEnv("PG_NAS_PORT")),
    user: requiredEnv("PG_NAS_USER"),
    password: requiredEnv("PG_NAS_PASSWORD"),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  }
  const marketClient = new pg.Client({
    ...common,
    database: "aistk",
    application_name: "suya_revealed_outcome_market_reader",
  })
  const indexClient = new pg.Client({
    ...common,
    database: "cn_stock_db",
    application_name: "suya_revealed_outcome_index_reader",
  })

  try {
    await Promise.all([marketClient.connect(), indexClient.connect()])
    const [dates, rows] = await Promise.all([
      revealDates(path.join(root, "reveals")),
      fetchNextSessionReturns(marketClient, indexClient),
    ])
    const report = buildRevealedOutcomes(rows, dates)
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(`Built market outcomes for ${report.records.length} revealed record${report.records.length === 1 ? "" : "s"}`)
  } finally {
    await Promise.all([
      marketClient.end().catch(() => {}),
      indexClient.end().catch(() => {}),
    ])
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
