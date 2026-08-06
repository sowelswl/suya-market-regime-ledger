#!/usr/bin/env node

import path from "node:path"

import { parseArgs, requireOption } from "../lib/cli.mjs"
import { publishReveal } from "../lib/files.mjs"

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options["confirm-five-observations"] !== true) {
    throw new Error("Refusing to reveal without confirming five later trading observations")
  }

  const publicRoot = path.resolve(typeof options.root === "string" ? options.root : process.cwd())
  const privateRoot = path.resolve(requireOption(options, "private-root"))
  const result = await publishReveal({
    publicRoot,
    privateRoot,
    asOfTradeDate: requireOption(options, "as-of-trade-date"),
  })
  console.log(`Published reveal: ${result.revealPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
