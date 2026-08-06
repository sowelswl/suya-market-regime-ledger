#!/usr/bin/env node

import path from "node:path"
import pg from "pg"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { prepareLatestFromDatabase } from "../lib/publisher.mjs"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const publicRoot = path.resolve(typeof options.root === "string" ? options.root : process.cwd())
  const privateRoot = path.resolve(
    typeof options["private-root"] === "string"
      ? options["private-root"]
      : requiredEnv("LEDGER_PRIVATE_ROOT"),
  )

  const client = new pg.Client({
    host: requiredEnv("PG_NAS_HOST"),
    port: Number(requiredEnv("PG_NAS_PORT")),
    user: requiredEnv("PG_NAS_USER"),
    password: requiredEnv("PG_NAS_PASSWORD"),
    database: "aistk",
    application_name: "suya_public_ledger_reader",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
  })

  try {
    await client.connect()
    const result = await prepareLatestFromDatabase({
      client,
      publicRoot,
      privateRoot,
      expectedAsOfDate: requireOption(options, "expected-as-of-date"),
      committedAt: typeof options["committed-at"] === "string"
        ? options["committed-at"]
        : new Date().toISOString(),
    })
    console.log(`Public commitment: ${result.commitmentPath}`)
    console.log(`Commitment digest: ${result.commitment.commitment}`)
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
