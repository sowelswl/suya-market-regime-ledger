import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { createLedgerEntry } from "../lib/ledger.mjs"
import { verifyReveal as verifyInBrowser } from "../site/assets/ledger.js"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("the public site explains the ledger without requiring GitHub knowledge", async () => {
  const [html, css, script] = await Promise.all([
    read("site/index.html"),
    read("site/assets/ledger.css"),
    read("site/assets/ledger.js"),
  ])

  assert.match(html, /苏牙择时/)
  assert.match(html, /强空[\s\S]*弱空[\s\S]*看平[\s\S]*弱多[\s\S]*强多/)
  assert.match(html, /等待揭示|验证通过/)
  assert.match(html, /不需要 GitHub|无需 GitHub/)
  assert.match(html, /id="latest-record"/)
  assert.match(html, /id="history-list"/)
  assert.match(html, /id="verification-panel"/)
  assert.match(css, /@media.*max-width/s)
  assert.match(script, /crypto\.subtle\.digest/)
  assert.match(script, /\.\/data\/index\.json/)
  assert.match(script, /verifyReveal/)
})

test("legacy Pages output and Sigstore publish the public evidence", async () => {
  const [sourceHtml, publishedHtml, builder, attest] = await Promise.all([
    read("site/index.html"),
    read("docs/index.html"),
    read("bin/build-pages.mjs"),
    read(".github/workflows/attest.yml"),
  ])

  assert.equal(publishedHtml, sourceHtml)
  assert.match(builder, /cp\(siteRoot, docsRoot/)
  assert.match(builder, /buildSiteData/)
  assert.match(builder, /\.nojekyll/)
  assert.match(attest, /actions\/attest@v4/)
  assert.match(attest, /id-token:\s*write/)
  assert.match(attest, /attestations:\s*write/)
  assert.match(attest, /commitments\/\*\*\/\*\.json/)
})

test("the browser verifier independently accepts a valid reveal and rejects tampering", async () => {
  const entry = createLedgerEntry({
    sequence: 1,
    previousCommitment: null,
    asOfTradeDate: "2026-08-05",
    committedAt: "2026-08-05T20:00:00+08:00",
    sourceGeneratedAt: "2026-08-05T19:31:14+08:00",
    signalLevel: 1,
    signalLabel: "弱多",
    nonce: "d".repeat(64),
  })

  assert.equal(await verifyInBrowser(entry.commitment, entry.reveal), true)
  assert.equal(await verifyInBrowser(entry.commitment, { ...entry.reveal, signal_label: "强多" }), false)
})
