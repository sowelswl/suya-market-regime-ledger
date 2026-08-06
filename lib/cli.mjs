export function parseArgs(argv) {
  const values = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`)

    const name = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      values[name] = true
      continue
    }

    values[name] = next
    index += 1
  }

  return values
}

export function requireOption(options, name) {
  const value = options[name]
  if (typeof value !== "string" || value === "") throw new Error(`Missing required option --${name}`)
  return value
}
