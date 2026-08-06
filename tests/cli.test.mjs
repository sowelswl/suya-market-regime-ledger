import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repositoryRoot = new URL("../", import.meta.url).pathname
const node = process.execPath
const nonce = "c".repeat(64)

function run(script, args) {
  return spawnSync(node, [path.join(repositoryRoot, "bin", script), ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
}

test("prepare CLI writes files without printing the state or nonce", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-cli-"))
  const result = run("prepare-signal.mjs", [
    "--root", root,
    "--signal-date", "2026-08-07",
    "--generated-at", "2026-08-06T20:00:00+08:00",
    "--state", "弱多",
    "--nonce", nonce,
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /commitments\/2026\/08\/2026-08-07\.json/)
  assert.match(result.stdout, /private\/pending\/2026-08-07\.json/)
  assert.doesNotMatch(result.stdout, /弱多/)
  assert.doesNotMatch(result.stdout, new RegExp(nonce))
})

test("reveal CLI requires an explicit five-trading-day confirmation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-cli-"))
  const common = ["--root", root, "--signal-date", "2026-08-07"]
  const prepared = run("prepare-signal.mjs", [
    ...common,
    "--generated-at", "2026-08-06T20:00:00+08:00",
    "--state", "看平",
    "--nonce", nonce,
  ])
  assert.equal(prepared.status, 0, prepared.stderr)

  const refused = run("reveal-signal.mjs", common)
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /five trading days/i)

  const revealed = run("reveal-signal.mjs", [...common, "--confirm-five-trading-days"])
  assert.equal(revealed.status, 0, revealed.stderr)
  assert.match(revealed.stdout, /reveals\/2026\/08\/2026-08-07\.json/)

  const verified = run("verify-signal.mjs", [
    "--commitment", path.join(root, "commitments/2026/08/2026-08-07.json"),
    "--reveal", path.join(root, "reveals/2026/08/2026-08-07.json"),
  ])
  assert.equal(verified.status, 0, verified.stderr)
  assert.match(verified.stdout, /verified/i)
})
