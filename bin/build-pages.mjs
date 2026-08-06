#!/usr/bin/env node

import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { buildSiteData } from "../lib/site-data.mjs"

const root = process.cwd()
const siteRoot = path.join(root, "site")
const docsRoot = path.join(root, "docs")

await rm(docsRoot, { recursive: true, force: true })
await cp(siteRoot, docsRoot, { recursive: true })

const data = await buildSiteData(root)
await mkdir(path.join(docsRoot, "data"), { recursive: true })
await writeFile(path.join(docsRoot, "data", "index.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8")
await writeFile(path.join(docsRoot, ".nojekyll"), "", "utf8")

console.log(`Built ${data.records.length} public ledger records in docs/`)
