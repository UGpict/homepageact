/** `facts.steps[1].memo` のように、指定プレフィックスから実在する値へ届くか。 */
export function jsonPathExists(root: unknown, sourceRef: string, prefix: "facts" | "brief"): boolean {
  if (!sourceRef.startsWith(`${prefix}.`)) return false
  const tokens = tokenize(sourceRef.slice(prefix.length + 1))
  if (!tokens) return false
  let current: unknown = root
  for (const token of tokens) {
    if (current === null || current === undefined) return false
    if (typeof token === "number") {
      if (!Array.isArray(current) || current[token] === undefined) return false
      current = current[token]
      continue
    }
    if (typeof current !== "object" || Array.isArray(current)) return false
    if (!(token in current)) return false
    current = (current as Record<string, unknown>)[token]
  }
  return current !== undefined && current !== null && current !== ""
}

function tokenize(path: string): Array<string | number> | null {
  const tokens: Array<string | number> = []
  for (const part of path.split(".")) {
    const matched = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?$/.exec(part)
    if (!matched?.[1]) return null
    tokens.push(matched[1])
    if (matched[2]) tokens.push(Number(matched[2]))
  }
  return tokens
}
