#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { buildSiteData } from "../lib/site-data.mjs"

const root = process.cwd()
const output = path.join(root, "site", "data", "index.json")
const data = await buildSiteData(root)

await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, "utf8")
console.log(`Built ${data.records.length} public ledger records`)
