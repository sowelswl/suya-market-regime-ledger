import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function read(path) {
  return readFile(new URL(path, root), "utf8")
}

test("repository documents the prospective proof boundary and five-state method", async () => {
  const [readme, methodology] = await Promise.all([read("README.md"), read("METHODOLOGY.md")])

  for (const state of ["强空", "弱空", "看平", "弱多", "强多"]) {
    assert.match(`${readme}\n${methodology}`, new RegExp(state))
  }

  assert.match(readme, /事前|prospective/i)
  assert.match(readme, /五个交易日/)
  assert.match(readme, /prepare-signal\.mjs/)
  assert.match(readme, /reveal-signal\.mjs/)
  assert.match(readme, /verify-signal\.mjs/)
  assert.match(readme, /不公开[^\n]*(?:模型代码|实时信号)/)
  assert.match(methodology, /风险暴露/)
  assert.match(methodology, /不是[^\n]*仓位指令/)
})

test("private pending reveals are excluded and historical research is separated", async () => {
  const [ignore, archive, corrections] = await Promise.all([
    read(".gitignore"),
    read("research-archive/README.md"),
    read("corrections/README.md"),
  ])

  assert.match(ignore, /^private\/$/m)
  assert.match(archive, /回溯|事后/)
  assert.match(archive, /不具有[^\n]*事前时间戳/)
  assert.match(corrections, /只追加|不得覆盖/)
  assert.match(corrections, /原始承诺/)
})

test("continuous integration runs the complete verifier test suite", async () => {
  const workflow = await read(".github/workflows/test.yml")

  assert.match(workflow, /npm test/)
  assert.match(workflow, /node-version:\s*20/)
})
