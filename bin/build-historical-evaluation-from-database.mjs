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
  const client = new pg.Client({
    host: requiredEnv("PG_NAS_HOST"),
    port: Number(requiredEnv("PG_NAS_PORT")),
    user: requiredEnv("PG_NAS_USER"),
    password: requiredEnv("PG_NAS_PASSWORD"),
    database: "aistk",
    application_name: "suya_historical_evaluation_reader",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  })

  try {
    await client.connect()
    const rows = await fetchHistoricalEvaluationRows(client)
    const report = buildHistoricalEvaluation(rows)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(`Built aggregate evaluation for ${report.scope.observations} observations`)
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
