function canonicalizeValue(value) {
  if (value === null) return "null"

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON numbers must be finite")
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeValue).join(",")}]`
  }

  if (typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError("Canonical JSON requires a valid JSON value")
      return `${JSON.stringify(key)}:${canonicalizeValue(value[key])}`
    })
    return `{${entries.join(",")}}`
  }

  throw new TypeError("Canonical JSON requires a valid JSON value")
}

export function canonicalize(value) {
  return canonicalizeValue(value)
}
