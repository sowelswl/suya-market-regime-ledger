#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import path from "node:path"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { verifyReveal } from "../lib/ledger.mjs"

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const commitmentPath = path.resolve(requireOption(options, "commitment"))
  const revealPath = path.resolve(requireOption(options, "reveal"))
  const [commitment, reveal] = await Promise.all([
    readFile(commitmentPath, "utf8").then(JSON.parse),
    readFile(revealPath, "utf8").then(JSON.parse),
  ])

  if (!verifyReveal(commitment, reveal)) throw new Error("Verification failed")
  console.log(`Verified: ${commitment.signal_date} matches ${commitment.commitment}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
