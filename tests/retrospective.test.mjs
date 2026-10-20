import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { buildRetrospectiveSignals, fetchRetrospectiveSignals } from "../lib/retrospective.mjs"
import { buildSiteData } from "../lib/site-data.mjs"
import { retrospectiveRows } from "../site/assets/ledger.js"

const recordedAt = "2026-10-20T14:30:00Z"
const manifest = { recorded_at: recordedAt, dates: ["2026-10-09", "2026-10-14"] }
const rows = [
  { as_of_trade_date: "2026-10-09", source_generated_at: "2026-10-09T03:00:00Z", signal_level: -1, later_observations: 7 },
  { as_of_trade_date: "2026-10-14", source_generated_at: "2026-10-14T03:00:00Z", signal_level: 2, later_observations: 4 },
]

test("retrospective signals retain actual recording time and suppress signals before five observations", () => {
  const data = buildRetrospectiveSignals(rows, manifest)
  assert.equal(data.after_the_fact, true)
  assert.equal(data.prospective_evidence, false)
  assert.equal(data.recorded_at, recordedAt)
  assert.equal(data.records.length, 2)
  const pending = data.records.find((r) => r.as_of_trade_date === "2026-10-14")
  const visible = data.records.find((r) => r.as_of_trade_date === "2026-10-09")
  assert.equal(pending.status, "awaiting_observations")
  assert.equal("signal_level" in pending, false)
  assert.equal("signal_label" in pending, false)
  assert.equal(visible.status, "retrospective")
  assert.equal(visible.signal_level, -1)
  assert.equal(visible.signal_label, "弱空")
  assert.doesNotMatch(JSON.stringify(data), /nonce|commitment|sequence|strategy_name|param_hash/)
  const matured = buildRetrospectiveSignals([{ ...rows[1], later_observations: 5 }], { ...manifest, dates: ["2026-10-14"] })
  assert.equal(matured.records[0].signal_label, "强多")
  assert.equal(matured.recorded_at, recordedAt)
})

test("retrospective data rejects missing, duplicate, invalid or unrequested source rows", () => {
  assert.throws(() => buildRetrospectiveSignals(rows.slice(0, 1), manifest), /Missing/)
  assert.throws(() => buildRetrospectiveSignals([...rows, rows[0]], manifest), /Duplicate/)
  assert.throws(() => buildRetrospectiveSignals([{ ...rows[0], signal_level: null }, rows[1]], manifest), /signal/i)
  assert.throws(() => buildRetrospectiveSignals([{ ...rows[0], later_observations: -1 }, rows[1]], manifest), /observation/i)
  assert.throws(() => buildRetrospectiveSignals(rows, { ...manifest, recorded_at: "invalid" }), /timestamp/i)
  assert.throws(() => buildRetrospectiveSignals(rows, { ...manifest, dates: ["2026-10-09"] }), /Unexpected/)
})

test("retrospective query is parameterized, read-only, and rolls back on failure", async () => {
  const queries = []
  const client = { query: async (sql, params) => { queries.push({ sql, params }); return { rows } } }
  assert.deepEqual(await fetchRetrospectiveSignals(client, manifest.dates), rows)
  assert.equal(queries[0].sql, "BEGIN READ ONLY")
  assert.equal(queries.at(-1).sql, "ROLLBACK")
  assert.match(queries[1].sql, /ANY\(\$4::date\[\]\)/)
  assert.match(queries[1].sql, /count\(DISTINCT/)
  assert.deepEqual(queries[1].params[3], manifest.dates)
  assert.doesNotMatch(queries[1].sql, /2026-10-09/)
  const failures = []
  await assert.rejects(fetchRetrospectiveSignals({ query: async (sql) => {
    failures.push(sql)
    if (sql.includes("SELECT")) throw new Error("read failed")
    return { rows: [] }
  } }, manifest.dates), /read failed/)
  assert.equal(failures.at(-1), "ROLLBACK")
})

test("backfills remain separate from the commitment chain and expire at the public window boundary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "suya-backfill-"))
  await mkdir(path.join(root, "evaluation/public"), { recursive: true })
  await mkdir(path.join(root, "commitments"))
  await writeFile(path.join(root, "evaluation/public/retrospective-signals.json"), JSON.stringify(buildRetrospectiveSignals(rows, manifest)))
  for (let day = 1; day <= 20; day += 1) {
    await writeFile(path.join(root, `commitments/${day}.json`), JSON.stringify({ sequence: day, as_of_trade_date: `2026-11-${String(day).padStart(2, "0")}`, committed_at: recordedAt }))
  }
  const data = await buildSiteData(root)
  assert.equal(data.records.length, 20)
  assert.deepEqual(data.retrospective_signals.records, [])
  assert.equal(data.retrospective_signals.after_the_fact, true)
})

test("backfill presentation labels pending and published rows without prospective verification claims", () => {
  const view = retrospectiveRows(buildRetrospectiveSignals(rows, manifest))
  assert.equal(view.length, 2)
  assert.match(view.find((r) => r.date === "2026-10-14").state, /等待.*5/)
  assert.equal(view.find((r) => r.date === "2026-10-09").state, "弱空")
  assert.ok(view.every((r) => r.evidence === "事后补录 · 无事前证明"))
  assert.ok(view.every((r) => r.recordedAt === recordedAt))
  assert.doesNotMatch(JSON.stringify(view), /验证通过|承诺已经锁定/)
  assert.deepEqual(retrospectiveRows(null), [])
})

test("the daily publisher refreshes backfills and publishes their evidence with the snapshot", async () => {
  const script = await readFile(new URL("../ops/publish-daily.sh", import.meta.url), "utf8")
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8")
  const workflow = await readFile(new URL("../.github/workflows/attest.yml", import.meta.url), "utf8")
  assert.match(script, /build-retrospective-signals-from-database\.mjs/)
  assert.match(script, /retrospective-signals\.json/)
  assert.match(html, /id="retrospective-list"/)
  assert.match(html, /事后补录/)
  assert.match(workflow, /evaluation\/public\/retrospective-signals\.json/)
})
