import assert from "node:assert/strict"
import test from "node:test"

import { canonicalize } from "../lib/canonical.mjs"

test("RFC 8785 canonicalization sorts object keys recursively without changing arrays", () => {
  assert.equal(
    canonicalize({ z: 1, a: { y: "中文", b: true }, list: [3, { d: null, c: "x" }] }),
    '{"a":{"b":true,"y":"中文"},"list":[3,{"c":"x","d":null}],"z":1}',
  )
})

test("canonicalization rejects values outside the JSON data model", () => {
  assert.throws(() => canonicalize({ missing: undefined }), /JSON value/i)
  assert.throws(() => canonicalize(Number.NaN), /finite/i)
})
