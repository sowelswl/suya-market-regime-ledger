#!/usr/bin/env node

import path from "node:path"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { appendCorrection } from "../lib/files.mjs"

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = path.resolve(typeof options.root === "string" ? options.root : process.cwd())
  const result = await appendCorrection(root, {
    signal_date: requireOption(options, "signal-date"),
    recorded_at: requireOption(options, "recorded-at"),
    original_commitment: requireOption(options, "original-commitment"),
    reason: requireOption(options, "reason"),
    action: requireOption(options, "action"),
  })

  console.log(`Appended correction: ${result.correctionPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
