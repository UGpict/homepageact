import { extractNumbers } from "./numbers.ts"

const CTA_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["お問い合わせはこちら", "分析について相談する"],
]

const PREDICATES = [
  "進展しない",
  "進展する",
  "原因になる",
  "原因にはならない",
  "原因にはなりえない",
  "より硬い",
  "より硬く",
  "より脆い",
  "より柔らかい",
  "より高い",
  "より低い",
  "判定しない",
  "判定する",
] as const

export type TierDecision = {
  tier: "L1" | "L2"
  reason: string
}

/**
 * text_edit の昇格判定。モデルには訊かない。
 * 数値・単位・化学式・規格名・比較/否定が変われば L2。
 * それ以外で句読点、登録済みCTA、1文字差分だけが L1。残りは L2。
 */
export function classifyTextEdit(before: string, after: string): TierDecision {
  if (before === after) return { tier: "L1", reason: "変更なし" }

  const beforeTech = technicalFingerprint(before)
  const afterTech = technicalFingerprint(after)
  if (beforeTech !== afterTech) {
    return { tier: "L2", reason: "技術的な主張の差分" }
  }

  if (normalizePunct(before) === normalizePunct(after)) {
    return { tier: "L1", reason: "句読点・空白のみ" }
  }

  let reducedBefore = before
  let reducedAfter = after
  for (const [from, to] of CTA_PAIRS) {
    if (reducedBefore.includes(from) && reducedAfter.includes(to)) {
      reducedBefore = reducedBefore.replace(from, "")
      reducedAfter = reducedAfter.replace(to, "")
    }
  }
  if (normalizePunct(reducedBefore) === normalizePunct(reducedAfter)) {
    return { tier: "L1", reason: "CTAラベルのみ" }
  }

  if (isSingleEdit(normalizePunct(before), normalizePunct(after))) {
    return { tier: "L1", reason: "1文字の誤字" }
  }

  return { tier: "L2", reason: "分類できない本文差分" }
}

function technicalFingerprint(text: string): string {
  const normalized = text.normalize("NFKC")
  const numbers = extractNumbers(text).join(",")
  const units = (
    normalized.match(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:℃|°C|%|％|μm|µm|mm|cm|nm|年|件|倍|個)/g) ?? []
  )
    .map((token) => token.replace(/\s+/g, ""))
    .join(",")
  const chemicals = (
    text.match(/[A-Z][a-z]?(?:[₀₁₂₃₄₅₆₇₈₉0-9]+)(?:[A-Z][a-z]?(?:[₀₁₂₃₄₅₆₇₈₉0-9]+))*/g) ?? []
  ).join(",")
  const standards = (normalized.match(/(?:JIS|ISO|IEC|IPC|AEC)[-\s]?[A-Z0-9][A-Z0-9.-]*/g) ?? []).join(
    ",",
  )
  const predicates = PREDICATES.filter((predicate) => text.includes(predicate)).join(",")
  return [numbers, units, chemicals, standards, predicates].join("|")
}

function normalizePunct(text: string): string {
  return text.replace(/\s+/g, "").replace(/[、。．，,.!！?？「」『』（）()]/g, "")
}

function isSingleEdit(before: string, after: string): boolean {
  if (Math.abs(before.length - after.length) > 1) return false
  if (before === after) return true
  if (before.length === after.length) {
    let differences = 0
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) differences++
    }
    return differences === 1
  }
  const [shorter, longer] = before.length < after.length ? [before, after] : [after, before]
  let i = 0
  let j = 0
  let skipped = 0
  while (i < shorter.length && j < longer.length) {
    const left = shorter[i]
    const right = longer[j]
    if (left !== undefined && left === right) {
      i++
      j++
    } else {
      skipped++
      j++
      if (skipped > 1) return false
    }
  }
  return true
}
