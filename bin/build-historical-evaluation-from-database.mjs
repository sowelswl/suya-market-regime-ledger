#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

import { buildHistoricalEvaluation } from "../lib/historical-evaluation.mjs"
import { fetchHistoricalEvaluationRows } from "../lib/historical-source.mjs"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function main() {
  const output = path.resolve(process.cwd(), "evaluation/public/history.json")
  const common = {
    host: requiredEnv("PG_NAS_HOST"),
    port: Number(requiredEnv("PG_NAS_PORT")),
    user: requiredEnv("PG_NAS_USER"),
    password: requiredEnv("PG_NAS_PASSWORD"),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  }
  const signalClient = new pg.Client({
    ...common,
    database: "signal_db",
    application_name: "suya_historical_signal_reader",
  })
  const marketClient = new pg.Client({
    ...common,
    database: "aistk",
    application_name: "suya_historical_market_reader",
  })

  try {
    await Promise.all([signalClient.connect(), marketClient.connect()])
    const rows = await fetchHistoricalEvaluationRows(signalClient, marketClient)
    const report = buildHistoricalEvaluation(rows)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(`Built aggregate evaluation for ${report.scope.observations} observations`)
  } finally {
    await Promise.all([
      signalClient.end().catch(() => {}),
      marketClient.end().catch(() => {}),
    ])
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
