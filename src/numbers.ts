/** 全角数字を畳んでから、桁区切りを1トークンとして取り出す。 */
export function extractNumbers(text: string): string[] {
  const normalized = text.normalize("NFKC")
  const matches = normalized.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []
  return matches.map((match) => match.replaceAll(",", ""))
}

export function unsourcedNumbers(generatedText: string, sourceText: string): string[] {
  const sources = new Set(extractNumbers(sourceText))
  const extras: string[] = []
  const seen = new Set<string>()
  for (const token of extractNumbers(generatedText)) {
    if (sources.has(token) || seen.has(token)) continue
    seen.add(token)
    extras.push(token)
  }
  return extras
}

export function normalizeForScan(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "")
}

export function findConfidentialLeaks(texts: string[], terms: string[]): string[] {
  const haystack = normalizeForScan(texts.join("\n"))
  const hits: string[] = []
  for (const term of terms) {
    const needle = normalizeForScan(term)
    if (needle && haystack.includes(needle)) hits.push(term)
  }
  return hits
}
