#!/usr/bin/env node

import path from "node:path"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { prepareSignalFiles } from "../lib/files.mjs"

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = path.resolve(typeof options.root === "string" ? options.root : process.cwd())
  const result = await prepareSignalFiles(root, {
    signalDate: requireOption(options, "signal-date"),
    generatedAt: requireOption(options, "generated-at"),
    state: requireOption(options, "state"),
    ...(typeof options.nonce === "string" ? { nonce: options.nonce } : {}),
  })

  console.log(`Public commitment: ${result.commitmentPath}`)
  console.log(`Private pending reveal: ${result.privateRevealPath}`)
  console.log(`Commitment digest: ${result.commitment.commitment}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
