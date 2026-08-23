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
  assert.match(html, /看平[\s\S]*轻微多头/)
  assert.match(html, /强空[\s\S]*轻微空头/)
  assert.doesNotMatch(html, /看平<\/strong><small>中性观察/)
  assert.match(html, /等待揭示|验证通过/)
  assert.match(html, /不需要 GitHub|无需 GitHub/)
  assert.match(html, /id="latest-record"/)
  assert.match(html, /id="history-list"/)
  assert.match(html, /id="evaluation"/)
  assert.match(html, /历史评价/)
  assert.match(html, /全历史、近 3 个月和近 1 个月/)
  assert.match(html, /id="evaluation-windows"/)
  assert.match(html, /assets\/ledger\.css\?v=20260823-windows/)
  assert.match(html, /assets\/ledger\.js\?v=20260823-windows/)
  assert.match(html, /每天一条[\s\S]*时序信号/)
  assert.match(html, /核心研究资产/)
  assert.match(html, /最近 20 个交易日/)
  assert.match(html, /id="verification-panel"/)
  assert.match(css, /@media.*max-width/s)
  assert.match(script, /crypto\.subtle\.digest/)
  assert.match(script, /\.\/data\/index\.json/)
  assert.match(script, /verifyReveal/)
  assert.match(script, /historical_evaluation/)
  assert.match(script, /evaluation_windows/)
  assert.match(script, /mean_directional_return/)
  assert.match(script, /完整历史/)
  assert.match(script, /近 3 个月/)
  assert.match(script, /近 1 个月/)
  assert.match(script, /direction_hit_rate/)
  assert.match(script, /invalidatedDates/)
  assert.match(script, /已作废/)
  assert.match(script, /corrections/)
  assert.match(script, /下一交易日实绩/)
  assert.match(script, /中证500[\s\S]*沪深300[\s\S]*中证1000[\s\S]*中证2000[\s\S]*上证指数/)
  assert.match(script, /方向一致/)
  assert.match(css, /\.record-outcomes/)
  assert.match(css, /\.outcome-grid/)
  assert.match(css, /\.evaluation-window-grid/)
  assert.match(css, /\.evaluation-window-card/)
  assert.match(html, /方向调整后平均次日/)
})

test("the public docs snapshot and Sigstore publish the evidence", async () => {
  const [sourceHtml, publishedHtml, publishedData, builder, attest] = await Promise.all([
    read("site/index.html"),
    read("docs/index.html"),
    read("docs/data/index.json"),
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
  assert.match(attest, /evaluation\/public\/revealed-outcomes\.json/)
  const data = JSON.parse(publishedData)
  assert.deepEqual(Object.keys(data.historical_evaluation.benchmarks), [
    "csi500",
    "hs300",
    "csi1000",
    "csi2000",
    "sse_composite",
  ])
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

test("the browser verifier accepts both frozen source identities during migration", async () => {
  const oldSource = "aistk.public.micro_timing_final_tail_hold_dates:trend5mcx"
  const legacy = createLedgerEntry({ ...{
    sequence: 1,
    previousCommitment: null,
    asOfTradeDate: "2026-08-05",
    committedAt: "2026-08-05T20:00:00+08:00",
    sourceGeneratedAt: "2026-08-05T19:31:14+08:00",
    signalLevel: 1,
    signalLabel: "弱多",
    nonce: "e".repeat(64),
  }, source: oldSource })

  assert.equal(await verifyInBrowser(legacy.commitment, legacy.reveal), true)
  assert.equal(await verifyInBrowser(
    { ...legacy.commitment, source: "unknown.source" },
    { ...legacy.reveal, source: "unknown.source" },
  ), false)
})
