#!/usr/bin/env node

import path from "node:path"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { prepareSignalFiles } from "../lib/files.mjs"

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const publicRoot = path.resolve(typeof options.root === "string" ? options.root : process.cwd())
  const privateRoot = path.resolve(requireOption(options, "private-root"))
  const sequence = typeof options.sequence === "string" ? Number(options.sequence) : 1
  const previousCommitment = typeof options["previous-commitment"] === "string"
    ? options["previous-commitment"]
    : null

  const result = await prepareSignalFiles({
    publicRoot,
    privateRoot,
    input: {
      sequence,
      previousCommitment,
      asOfTradeDate: requireOption(options, "as-of-trade-date"),
      committedAt: requireOption(options, "committed-at"),
      sourceGeneratedAt: requireOption(options, "source-generated-at"),
      signalLevel: Number(requireOption(options, "signal-level")),
      signalLabel: requireOption(options, "signal-label"),
      ...(typeof options.nonce === "string" ? { nonce: options.nonce } : {}),
    },
  })

  console.log(`Public commitment: ${result.commitmentPath}`)
  console.log(`Private pending reveal: ${result.privateRevealPath}`)
  console.log(`Commitment digest: ${result.commitment.commitment}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
