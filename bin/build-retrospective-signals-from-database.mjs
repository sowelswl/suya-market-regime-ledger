#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

import { buildRetrospectiveSignals, fetchRetrospectiveSignals } from "../lib/retrospective.mjs"
import { buildSiteData } from "../lib/site-data.mjs"

async function main() {
  const root = process.cwd()
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(root, "research-archive/retrospective-request.json"), "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  const data = await buildSiteData(root)
  const cutoffDate = data.records.at(-1)?.commitment.as_of_trade_date ?? null
  const client = new pg.Client({
    host: process.env.PG_NAS_HOST,
    port: Number(process.env.PG_NAS_PORT),
    user: process.env.PG_NAS_USER,
    password: process.env.PG_NAS_PASSWORD,
    database: "signal_db",
    application_name: "suya_retrospective_signal_reader",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  })
  try {
    await client.connect()
    const rows = await fetchRetrospectiveSignals(client, manifest.dates)
    const report = buildRetrospectiveSignals(rows, manifest, { cutoffDate })
    await writeFile(path.join(root, "evaluation/public/retrospective-signals.json"), `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Built ${report.records.length} retrospective records (not prospective evidence)`)
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch(() => {
  console.error("Retrospective signal build failed; no source details logged")
  process.exitCode = 1
})
