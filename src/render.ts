import { HarnessError } from "./errors.ts"
import type {
  AchievementFacts,
  Block,
  ColumnBrief,
  PublicAchievement,
  PublicColumn,
} from "./schema.ts"
import { termLabel, type SitePack, type Taxonomy } from "./sitepack.ts"

export const INDEX_DISCLAIMER =
  "一部実績は関連会社と共同で行い、試験・観察を担当した案件を含みます。社内検証での実績も含みます。対応可否は材料・条件によって異なります。"

type ImageCopy = { alt: string; caption: string }

export function renderAchievement(doc: PublicAchievement, pack: SitePack): string {
  const { facts, generated } = doc
  const copyById = new Map(generated.images.map((image) => [image.id, image]))
  const lines: string[] = [
    `title: ${generated.title}`,
    `heading: ${generated.h1}`,
    `shortTitle: ${generated.shortTitle}`,
    `listing: ${generated.listingSummary}`,
    `lead: ${generated.lead}`,
    `description: ${generated.description}`,
    `ogImageAlt: ${generated.ogImageAlt}`,
    `tags: ${renderTags(facts.tags, pack.taxonomy)}`,
  ]

  if (facts.clientPurpose) lines.push(`目的: ${facts.clientPurpose}`)
  lines.push("課題", facts.challenge, "解決策")
  if (generated.solutionHeadline) lines.push(generated.solutionHeadline)
  if (generated.solutionBody) lines.push(generated.solutionBody)
  if (facts.origin) lines.push(renderOrigin(facts, pack.taxonomy))
  if (facts.workContext === "internal") lines.push("社内検証での実績です。")
  if (facts.workContext === "partner") {
    lines.push("関連会社と共同で行い、試験・観察を担当した案件です。")
  }

  const referenced = new Set(facts.steps.flatMap((step) => step.images))
  for (const image of facts.images) {
    if (referenced.has(image.id)) continue
    lines.push(...renderImage(image, copyById))
  }

  for (const step of facts.steps) {
    const point = generated.points.find((candidate) => candidate.stepId === step.id)
    if (!point) throw new HarnessError("C06", `missing point for ${step.id}`)
    lines.push(`## ${point.title}`)
    lines.push(...renderBlocks(point.blocks, copyById))
    for (const item of step.items) lines.push(`・${item}`)
    for (const formula of step.formulas) lines.push(formula.text)
    for (const note of step.scopeNotes) lines.push(`※${note}`)
    for (const imageId of step.images) {
      const image = facts.images.find((candidate) => candidate.id === imageId)
      if (!image) throw new HarnessError("C07", `unknown image ${imageId}`)
      lines.push(...renderImage(image, copyById))
    }
  }

  lines.push("結果", facts.outcome)
  for (const note of facts.scopeNotes) lines.push(`※${note}`)
  for (const claimId of facts.claimIds) lines.push(claimText(pack, claimId))
  for (const link of generated.relatedLinks) {
    lines.push(`${link.label} -> ${link.ref.kind}:${link.ref.slug}`)
  }
  for (const faq of generated.faq ?? []) {
    lines.push(faq.q, faq.a)
  }
  if (facts.youtubeId) lines.push(`youtube: ${facts.youtubeId}`)
  return lines.join("\n")
}

export function renderAchievementIndex(docs: PublicAchievement[], pack: SitePack): string {
  const lines = docs.map((doc) => `### ${doc.generated.h1}\n${doc.generated.listingSummary}`)
  if (docs.some((doc) => doc.facts.workContext !== "customer")) lines.push(INDEX_DISCLAIMER)
  void pack
  return lines.join("\n\n")
}

export function renderColumn(doc: PublicColumn, pack: SitePack): string {
  const copyById = new Map(doc.generated.images.map((image) => [image.id, image]))
  const lines: string[] = [
    `title: ${doc.generated.title}`,
    `heading: ${doc.generated.h1}`,
    `shortTitle: ${doc.generated.shortTitle}`,
    `listing: ${doc.generated.listingSummary}`,
    `lead: ${doc.generated.lead}`,
    `description: ${doc.generated.description}`,
    `ogImageAlt: ${doc.generated.ogImageAlt}`,
  ]
  for (const stance of doc.brief.houseStances) lines.push(stance.statement)
  for (const section of doc.outline) {
    const body = doc.generated.sections.find((candidate) => candidate.outlineId === section.id)
    if (!body) throw new HarnessError("C06", `missing section ${section.id}`)
    lines.push(`## ${section.heading}`)
    lines.push(...renderBlocks(body.blocks, copyById))
  }
  for (const claimId of doc.brief.claimIds) lines.push(claimText(pack, claimId))
  for (const link of doc.generated.relatedLinks) {
    lines.push(`${link.label} -> ${link.ref.kind}:${link.ref.slug}`)
  }
  return lines.join("\n")
}

function renderOrigin(facts: AchievementFacts, taxonomy: Taxonomy): string {
  const origin = facts.origin
  if (!origin) return ""
  const industry = termLabel(taxonomy, "industries", origin.industry)
  const year = origin.year === undefined ? "" : `${origin.year}年、`
  const ongoing = origin.ongoing ? "以来、継続的にご依頼をいただいています。" : ""
  return `${year}${industry}より、「${origin.request}」とのご相談をいただいたことが、本技術開発のきっかけとなりました。${ongoing}`
}

function renderTags(tags: AchievementFacts["tags"], taxonomy: Taxonomy): string {
  const groups = ["components", "materials", "methods", "purposes", "industries"] as const
  const labels: string[] = []
  for (const group of groups) {
    for (const id of tags[group]) labels.push(termLabel(taxonomy, group, id))
  }
  return labels.join(" / ")
}

function renderBlocks(blocks: Block[], copyById: Map<string, ImageCopy>): string[] {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === "list" || block.type === "formula") continue
    if (block.type === "p") lines.push(block.text)
    if (block.type === "table") {
      lines.push(block.head.join(" | "))
      for (const row of block.rows) lines.push(row.join(" | "))
    }
    if (block.type === "image") {
      const copy = copyById.get(block.ref)
      if (!copy) throw new HarnessError("C07", `caption missing for ${block.ref}`)
      lines.push(copy.alt, copy.caption)
    }
    if (block.type === "link") {
      lines.push(`${block.label} -> ${block.ref.kind}:${block.ref.slug}`)
    }
  }
  return lines
}

function renderImage(
  image: AchievementFacts["images"][number],
  copyById: Map<string, ImageCopy>,
): string[] {
  const copy = copyById.get(image.id)
  if (!copy) throw new HarnessError("C07", `caption missing for ${image.id}`)
  const lines = [copy.alt, copy.caption]
  if (image.substituteNote) lines.push(image.substituteNote)
  for (const bar of image.scaleBars) lines.push(bar)
  if (image.legend) lines.push(image.legend)
  return lines
}

function claimText(pack: SitePack, id: string): string {
  const claim = pack.claims.find((candidate) => candidate.id === id)
  if (!claim) throw new HarnessError("C20", `unknown claim ${id}`)
  return claim.text
}

export function humanStrings(value: unknown): string[] {
  const found: string[] = []
  walk(value, found)
  return found
}

function walk(value: unknown, found: string[]): void {
  if (typeof value === "string") {
    found.push(value)
    return
  }
  if (typeof value === "number") {
    found.push(String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found)
    return
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "clearance" || key === "file" || key === "id") continue
      walk(child, found)
    }
  }
}
