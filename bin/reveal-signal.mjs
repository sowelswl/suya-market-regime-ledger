#!/usr/bin/env node

import path from "node:path"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { publishReveal } from "../lib/files.mjs"

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options["confirm-five-trading-days"] !== true) {
    throw new Error("Refusing to reveal without confirming that five trading days have elapsed")
  }

  const root = path.resolve(typeof options.root === "string" ? options.root : process.cwd())
  const result = await publishReveal(root, requireOption(options, "signal-date"))
  console.log(`Published reveal: ${result.revealPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
