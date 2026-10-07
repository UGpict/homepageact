import type { AchievementFacts, ColumnBrief, OutlineSection } from "./schema.ts"
import { selectVerifiedClaims, type PageIndexEntry, type SitePack } from "./sitepack.ts"

export type GenerationPayload = {
  recipe: "achievement" | "column"
  facts?: AchievementFacts
  brief?: ColumnBrief
  outline?: OutlineSection[]
  styleExcerpt: string
  claims: Array<{ id: string; text: string }>
  verifiedClaims: Array<{
    id: string
    statement: string
    scope: string
    conditions: string
    notFor: string[]
    requiresContextCheck: true
  }>
  pageIndex: PageIndexEntry[]
  samples: Array<{ id: string; excerpt: string }>
  outputSchema: "AchievementModelOutput" | "ColumnModelOutput"
}

type PayloadExtras = {
  pack: SitePack
  pageIndex: PageIndexEntry[]
  samples: Array<{ id: string; excerpt: string }>
  today: string
  styleExcerpt: string
  /** 生成プロンプトには載せない。型に残すのは、渡しても捨てるとテストで示すため。 */
  confidentialTerms?: string[]
  chatTranscript?: string
}

/**
 * 相談チャットと機密語は戻り値に含めない。
 * 呼び出し側が渡しても、構造上フィールドが無い。
 */
export function buildAchievementPayload(
  facts: AchievementFacts,
  extras: PayloadExtras,
): GenerationPayload {
  void extras.confidentialTerms
  void extras.chatTranscript
  return {
    recipe: "achievement",
    facts,
    styleExcerpt: extras.styleExcerpt,
    claims: extras.pack.claims.map((claim) => ({ id: claim.id, text: claim.text })),
    verifiedClaims: usableVerified(extras.pack, extras.today),
    pageIndex: extras.pageIndex,
    samples: extras.samples,
    outputSchema: "AchievementModelOutput",
  }
}

export function buildColumnPayload(
  brief: ColumnBrief,
  outline: OutlineSection[],
  extras: PayloadExtras,
): GenerationPayload {
  void extras.confidentialTerms
  void extras.chatTranscript
  return {
    recipe: "column",
    brief,
    outline,
    styleExcerpt: extras.styleExcerpt,
    claims: extras.pack.claims.map((claim) => ({ id: claim.id, text: claim.text })),
    verifiedClaims: usableVerified(extras.pack, extras.today),
    pageIndex: extras.pageIndex,
    samples: extras.samples,
    outputSchema: "ColumnModelOutput",
  }
}

function usableVerified(pack: SitePack, today: string): GenerationPayload["verifiedClaims"] {
  return selectVerifiedClaims(pack.verifiedClaims, today).map((claim) => ({
    id: claim.id,
    statement: claim.statement,
    scope: claim.scope,
    conditions: claim.conditions,
    notFor: claim.notFor,
    requiresContextCheck: true as const,
  }))
}
