import { renderAchievement } from "../render.ts"
import type { JobClaim, JobRecord } from "../review.ts"
import type { PublicAchievement } from "../schema.ts"
import { termLabel, type SitePack } from "../sitepack.ts"
import type { JobPhase } from "./types.ts"

export type PreviewImage = {
  file: string
  alt: string
  caption: string
  substituteNote?: string
  scaleBars: string[]
  legend?: string
}

export type PreviewSection = {
  title: string
  paragraphs: string[]
  items: string[]
  formulas: Array<{ text: string; note?: string }>
  notes: string[]
  images: PreviewImage[]
}

export type PagePreview = {
  heading: string
  title: string
  lead: string
  tags: string[]
  purpose?: string
  challenge: string
  solutionHeadline?: string
  solutionBody?: string
  contextNote?: string
  origin?: string
  openingImages: PreviewImage[]
  sections: PreviewSection[]
  outcome: string
  notes: string[]
}

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
  preview: PagePreview
  claims: PresentedClaim[]
}

const PHASE_LABEL: Record<JobPhase, string> = {
  DRAFT: "下書き",
  GENERATING: "作成中",
  REQUESTER_REVIEW: "内容の確認",
  TECHNICAL_REVIEW: "技術確認待ち",
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

/** 未確認の主張が残っていれば技術確認待ち。確認の完了はここでは行わない。 */
export function phaseOf(job: Pick<JobRecord, "claims">): JobPhase {
  if (job.claims.some((claim) => claim.status === "pending")) return "TECHNICAL_REVIEW"
  return "REQUESTER_REVIEW"
}

export function toJobView(job: JobRecord, doc: PublicAchievement, pack: SitePack): JobView {
  const phase = phaseOf(job)
  const pendingCount = job.claims.filter((claim) => claim.status === "pending").length
  renderAchievement(doc, pack)
  return {
    jobId: job.jobId,
    phase,
    phaseLabel: PHASE_LABEL[phase],
    phaseNote:
      phase === "TECHNICAL_REVIEW"
        ? `${pendingCount}件の確認が終わるまで、このページは公開できません。`
        : "技術確認が必要な項目はありません。内容を確認してください。この画面では公開しません。",
    pendingCount,
    requestedBy: job.requestedBy,
    preview: pagePreview(doc, pack),
    claims: job.claims.map((claim) => presentClaim(claim, doc)),
  }
}

export function pagePreview(doc: PublicAchievement, pack: SitePack): PagePreview {
  const { facts, generated } = doc
  const copyById = new Map(generated.images.map((image) => [image.id, image]))
  const referenced = new Set(facts.steps.flatMap((step) => step.images))
  const imageView = (image: PublicAchievement["facts"]["images"][number]): PreviewImage => {
    const copy = copyById.get(image.id)
    return {
      file: image.file,
      alt: copy?.alt ?? image.memo,
      caption: copy?.caption ?? image.memo,
      substituteNote: image.substituteNote,
      scaleBars: image.scaleBars,
      legend: image.legend,
    }
  }

  return {
    heading: generated.h1,
    title: generated.title,
    lead: generated.lead,
    tags: tagLabels(facts.tags, pack),
    purpose: facts.clientPurpose,
    challenge: facts.challenge,
    solutionHeadline: generated.solutionHeadline,
    solutionBody: generated.solutionBody,
    contextNote:
      facts.workContext === "internal"
        ? "社内検証での実績です。"
        : facts.workContext === "partner"
          ? "関連会社と共同で行い、試験・観察を担当した案件です。"
          : undefined,
    origin: originText(facts, pack),
    openingImages: facts.images.filter((image) => !referenced.has(image.id)).map(imageView),
    sections: facts.steps.map((step) => {
      const point = generated.points.find((candidate) => candidate.stepId === step.id)
      return {
        title: point?.title ?? step.memo,
        paragraphs: (point?.blocks ?? []).flatMap((block) => (block.type === "p" ? [block.text] : [])),
        items: step.items,
        formulas: step.formulas,
        notes: step.scopeNotes,
        images: step.images.flatMap((id) => {
          const image = facts.images.find((candidate) => candidate.id === id)
          return image ? [imageView(image)] : []
        }),
      }
    }),
    outcome: facts.outcome,
    notes: facts.scopeNotes,
  }
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

function tagLabels(tags: PublicAchievement["facts"]["tags"], pack: SitePack): string[] {
  const labels: string[] = []
  for (const group of ["components", "materials", "methods", "purposes", "industries"] as const) {
    for (const id of tags[group]) labels.push(termLabel(pack.taxonomy, group, id))
  }
  return labels
}

function originText(facts: PublicAchievement["facts"], pack: SitePack): string | undefined {
  const origin = facts.origin
  if (!origin) return undefined
  const industry = termLabel(pack.taxonomy, "industries", origin.industry)
  const year = origin.year === undefined ? "" : `${origin.year}年、`
  const ongoing = origin.ongoing ? "以来、継続的にご依頼をいただいています。" : ""
  return `${year}${industry}より、「${origin.request}」とのご相談をいただいたことが、本技術開発のきっかけとなりました。${ongoing}`
}
