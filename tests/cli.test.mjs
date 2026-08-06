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

test("prepare CLI writes public and private files without printing the state or nonce", async () => {
  const publicRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-cli-public-"))
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-cli-private-"))
  const result = run("prepare-signal.mjs", [
    "--root", publicRoot,
    "--private-root", privateRoot,
    "--as-of-trade-date", "2026-08-05",
    "--committed-at", "2026-08-05T20:00:00+08:00",
    "--source-generated-at", "2026-08-05T19:31:14+08:00",
    "--signal-level", "1",
    "--signal-label", "弱多",
    "--nonce", nonce,
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /commitments\/2026\/08\/2026-08-05\.json/)
  assert.match(result.stdout, /pending\/2026-08-05\.json/)
  assert.doesNotMatch(result.stdout, /弱多/)
  assert.doesNotMatch(result.stdout, new RegExp(nonce))
})

test("reveal CLI requires an explicit five-observation confirmation", async () => {
  const publicRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-cli-public-"))
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "suya-ledger-cli-private-"))
  const common = [
    "--root", publicRoot,
    "--private-root", privateRoot,
    "--as-of-trade-date", "2026-08-05",
  ]
  const prepared = run("prepare-signal.mjs", [
    ...common,
    "--committed-at", "2026-08-05T20:00:00+08:00",
    "--source-generated-at", "2026-08-05T19:31:14+08:00",
    "--signal-level", "0",
    "--signal-label", "看平",
    "--nonce", nonce,
  ])
  assert.equal(prepared.status, 0, prepared.stderr)

  const refused = run("reveal-signal.mjs", common)
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /five later trading observations/i)

  const revealed = run("reveal-signal.mjs", [...common, "--confirm-five-observations"])
  assert.equal(revealed.status, 0, revealed.stderr)
  assert.match(revealed.stdout, /reveals\/2026\/08\/2026-08-05\.json/)

  const verified = run("verify-signal.mjs", [
    "--commitment", path.join(publicRoot, "commitments/2026/08/2026-08-05.json"),
    "--reveal", path.join(publicRoot, "reveals/2026/08/2026-08-05.json"),
  ])
  assert.equal(verified.status, 0, verified.stderr)
  assert.match(verified.stdout, /verified/i)
})
