import { presentAchievement, type AchievementPresentation } from "../render.ts"
import type { JobClaim, JobRecord } from "../review.ts"
import type { PublicAchievement } from "../schema.ts"
import type { SitePack } from "../sitepack.ts"
import type { JobPhase } from "./types.ts"

export type { AchievementPresentation }

export type PresentedClaim = {
  headline: string
  quotation: string
  explanation: string
  locationLabel: string
  kindLabel: string
  sourceLabel: string
  statusLabel: string
  detail: {
    id: string
    location: string
    kind: string
    source: string
    status: string
  }
}

export type JobView = {
  jobId: string
  phase: JobPhase
  phaseLabel: string
  phaseNote: string
  pendingCount: number
  requestedBy: string
  preview: AchievementPresentation
  claims: PresentedClaim[]
}

const PHASE_LABEL: Record<JobPhase, string> = {
  DRAFT: "下書き",
  GENERATING: "作成中",
  REQUESTER_REVIEW: "内容の確認",
  TECHNICAL_REVIEW: "技術確認待ち",
  UNREVIEWABLE: "技術確認対象を特定できませんでした",
  READY_TO_PUBLISH: "公開準備完了",
  GENERATION_FAILED: "作成できませんでした",
}

const KIND_LABEL: Record<JobClaim["kind"], string> = {
  number: "数値",
  mechanism: "技術的な説明",
  standard: "規格",
  comparison: "比較",
  "house-stance": "自社の見解",
  caption: "画像の説明",
  other: "確認事項",
}

const SOURCE_LABEL: Record<JobClaim["source"], string> = {
  facts: "入力内容",
  brief: "依頼内容",
  claims: "登録済みの説明",
  verified: "確認済みの知識",
  "ai-general": "下書きの文章",
}

/**
 * 技術確認が要るレシピで主張が0件なら、確認不要とは表示しない。
 * L2の主張0件は evaluateMerge が公開を拒否する。recipe の technical_review も同じ扱いにする。
 */
export function phaseOf(
  job: Pick<JobRecord, "claims" | "riskTier" | "recipe">,
  pack: SitePack,
): JobPhase {
  const recipe = pack.recipes[job.recipe]
  const reviewRequired = job.riskTier === "L2" || (recipe.technicalReview && recipe.tier >= 2)
  if (reviewRequired && job.claims.length === 0) return "UNREVIEWABLE"
  if (job.claims.some((claim) => claim.status === "pending")) return "TECHNICAL_REVIEW"
  return "REQUESTER_REVIEW"
}

export function toJobView(job: JobRecord, doc: PublicAchievement, pack: SitePack): JobView {
  const phase = phaseOf(job, pack)
  const pendingCount = job.claims.filter((claim) => claim.status === "pending").length
  return {
    jobId: job.jobId,
    phase,
    phaseLabel: PHASE_LABEL[phase],
    phaseNote: phaseNote(phase, pendingCount),
    pendingCount,
    requestedBy: job.requestedBy,
    preview: presentAchievement(doc, pack),
    claims: job.claims.map((claim) => presentClaim(claim, doc)),
  }
}

function phaseNote(phase: JobPhase, pendingCount: number): string {
  if (phase === "UNREVIEWABLE") return "安全のため公開できません。下書きを作り直してください。"
  if (phase === "TECHNICAL_REVIEW") return `${pendingCount}件の確認が終わるまで、このページは公開できません。`
  return "技術確認が必要な項目はありません。内容を確認してください。この画面では公開しません。"
}

export function presentClaim(claim: JobClaim, doc: PublicAchievement): PresentedClaim {
  const number = numberToken(claim)
  const quotation = number ? `数値 ${number} の出典が確認できません` : claim.text
  const headline = number ? quotation : headlineFor(claim.kind)
  return {
    headline,
    quotation,
    explanation: "この内容は公開前に技術担当者の確認が必要です。",
    locationLabel: locationLabel(claim.location, doc),
    kindLabel: KIND_LABEL[claim.kind],
    sourceLabel: SOURCE_LABEL[claim.source],
    statusLabel: claim.status === "pending" ? "確認待ち" : "確認済み",
    detail: {
      id: claim.id,
      location: claim.location,
      kind: claim.kind,
      source: claim.source,
      status: claim.status,
    },
  }
}

function headlineFor(kind: JobClaim["kind"]): string {
  if (kind === "mechanism") return "技術的な説明の確認が必要です"
  if (kind === "standard") return "規格に関する確認が必要です"
  if (kind === "comparison") return "比較に関する確認が必要です"
  if (kind === "house-stance") return "自社の見解として確認が必要です"
  if (kind === "caption") return "画像の説明を確認してください"
  if (kind === "number") return "数値の出典が確認できません"
  return "内容の確認が必要です"
}

function numberToken(claim: JobClaim): string | undefined {
  if (claim.kind !== "number" && !claim.id.startsWith("c12-")) return undefined
  const matched = claim.text.match(/数値\s+(\S+)\s+の出典/)
  return matched?.[1]
}

function locationLabel(location: string, doc: PublicAchievement): string {
  const stepIndex = doc.facts.steps.findIndex((step) => step.id === location)
  if (stepIndex >= 0) return `工程 ${stepIndex + 1}`
  if (doc.facts.images.some((image) => image.id === location)) return "画像"
  return "本文"
}

