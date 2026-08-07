#!/usr/bin/env node

import { prunePublicReveals } from "../lib/public-window.mjs"

const removed = await prunePublicReveals(process.cwd(), { windowSize: 20 })
console.log(`Removed ${removed.length} reveal${removed.length === 1 ? "" : "s"} outside the public 20-day window`)
