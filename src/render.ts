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

export type PublishedImage = {
  file: string
  alt: string
  caption: string
  substituteNote?: string
  scaleBars: string[]
  legend?: string
}

export type PublishedBlock =
  | { type: "p"; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "image"; image: PublishedImage }
  | { type: "link"; label: string; kind: string; slug: string }

export type PublishedSection = {
  title: string
  blocks: PublishedBlock[]
  items: string[]
  formulas: Array<{ text: string; note?: string }>
  notes: string[]
  images: PublishedImage[]
}

/** 公開JSONと本文プレビューが共有する表示モデル。Webの完成イメージもここから描く。 */
export type AchievementPresentation = {
  title: string
  heading: string
  shortTitle: string
  listingSummary: string
  lead: string
  description: string
  ogImageAlt: string
  tags: string[]
  purpose?: string
  challenge: string
  solutionHeadline?: string
  solutionBody?: string
  origin?: string
  contextNote?: string
  openingImages: PublishedImage[]
  sections: PublishedSection[]
  outcome: string
  notes: string[]
  statements: string[]
  relatedLinks: Array<{ label: string; sublabel?: string; kind: string; slug: string }>
  faq: Array<{ question: string; answer: string }>
  youtubeId?: string
  /** 本文の見出し以外で公開される文章。レビュー画面はこれを省略しない。 */
  reviewRows: Array<{ label: string; text: string }>
}

export function presentAchievement(doc: PublicAchievement, pack: SitePack): AchievementPresentation {
  const { facts, generated } = doc
  const copyById = new Map(generated.images.map((image) => [image.id, image]))
  const referenced = new Set(facts.steps.flatMap((step) => step.images))
  const relatedLinks = generated.relatedLinks.map((link) => ({
    label: link.label,
    sublabel: link.sublabel,
    kind: link.ref.kind,
    slug: link.ref.slug,
  }))
  const faq = (generated.faq ?? []).map((entry) => ({ question: entry.q, answer: entry.a }))
  const page: AchievementPresentation = {
    title: generated.title,
    heading: generated.h1,
    shortTitle: generated.shortTitle,
    listingSummary: generated.listingSummary,
    lead: generated.lead,
    description: generated.description,
    ogImageAlt: generated.ogImageAlt,
    tags: tagLabels(facts.tags, pack.taxonomy),
    purpose: facts.clientPurpose,
    challenge: facts.challenge,
    solutionHeadline: generated.solutionHeadline,
    solutionBody: generated.solutionBody,
    origin: facts.origin ? renderOrigin(facts, pack.taxonomy) : undefined,
    contextNote: contextNote(facts.workContext),
    openingImages: facts.images
      .filter((image) => !referenced.has(image.id))
      .map((image) => publishedImage(image, copyById)),
    sections: facts.steps.map((step) => {
      const point = generated.points.find((candidate) => candidate.stepId === step.id)
      if (!point) throw new HarnessError("C06", `missing point for ${step.id}`)
      return {
        title: point.title,
        blocks: presentBlocks(point.blocks, facts, copyById),
        items: step.items,
        formulas: step.formulas,
        notes: step.scopeNotes,
        images: step.images.map((imageId) => {
          const image = facts.images.find((candidate) => candidate.id === imageId)
          if (!image) throw new HarnessError("C07", `unknown image ${imageId}`)
          return publishedImage(image, copyById)
        }),
      }
    }),
    outcome: facts.outcome,
    notes: facts.scopeNotes,
    statements: facts.claimIds.map((id) => claimText(pack, id)),
    relatedLinks,
    faq,
    youtubeId: facts.youtubeId,
    reviewRows: [],
  }
  page.reviewRows = reviewRows(page)
  return page
}

export function renderAchievement(doc: PublicAchievement, pack: SitePack): string {
  return renderAchievementPresentation(presentAchievement(doc, pack))
}

export function renderAchievementPresentation(page: AchievementPresentation): string {
  const lines: string[] = [
    `title: ${page.title}`,
    `heading: ${page.heading}`,
    `shortTitle: ${page.shortTitle}`,
    `listing: ${page.listingSummary}`,
    `lead: ${page.lead}`,
    `description: ${page.description}`,
    `ogImageAlt: ${page.ogImageAlt}`,
    `tags: ${page.tags.join(" / ")}`,
  ]
  if (page.purpose) lines.push(`目的: ${page.purpose}`)
  lines.push("課題", page.challenge, "解決策")
  if (page.solutionHeadline) lines.push(page.solutionHeadline)
  if (page.solutionBody) lines.push(page.solutionBody)
  if (page.origin) lines.push(page.origin)
  if (page.contextNote) lines.push(page.contextNote)
  for (const image of page.openingImages) lines.push(...imageLines(image))
  for (const section of page.sections) {
    lines.push(`## ${section.title}`)
    lines.push(...blockLines(section.blocks))
    for (const item of section.items) lines.push(`・${item}`)
    for (const formula of section.formulas) lines.push(formula.text)
    for (const note of section.notes) lines.push(`※${note}`)
    for (const image of section.images) lines.push(...imageLines(image))
  }
  lines.push("結果", page.outcome)
  for (const note of page.notes) lines.push(`※${note}`)
  lines.push(...page.statements)
  for (const link of page.relatedLinks) lines.push(`${link.label} -> ${link.kind}:${link.slug}`)
  for (const entry of page.faq) lines.push(entry.question, entry.answer)
  if (page.youtubeId) lines.push(`youtube: ${page.youtubeId}`)
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

function contextNote(workContext: AchievementFacts["workContext"]): string | undefined {
  if (workContext === "internal") return "社内検証での実績です。"
  if (workContext === "partner") return "関連会社と共同で行い、試験・観察を担当した案件です。"
  return undefined
}

function reviewRows(page: AchievementPresentation): Array<{ label: string; text: string }> {
  const rows = [
    { label: "ページタイトル", text: page.title },
    { label: "短い名前", text: page.shortTitle },
    { label: "一覧の説明", text: page.listingSummary },
    { label: "検索結果の説明", text: page.description },
    { label: "共有画像の説明", text: page.ogImageAlt },
  ]
  for (const link of page.relatedLinks) {
    rows.push({
      label: "関連リンク",
      text: link.sublabel
        ? `${link.label}（${link.sublabel}） ${link.kind}:${link.slug}`
        : `${link.label} ${link.kind}:${link.slug}`,
    })
  }
  for (const entry of page.faq) {
    rows.push({ label: "質問", text: entry.question }, { label: "回答", text: entry.answer })
  }
  if (page.youtubeId) rows.push({ label: "動画", text: page.youtubeId })
  return rows
}

function publishedImage(
  image: AchievementFacts["images"][number],
  copyById: Map<string, ImageCopy>,
): PublishedImage {
  const copy = copyById.get(image.id)
  if (!copy) throw new HarnessError("C07", `caption missing for ${image.id}`)
  return {
    file: image.file,
    alt: copy.alt,
    caption: copy.caption,
    substituteNote: image.substituteNote,
    scaleBars: image.scaleBars,
    legend: image.legend,
  }
}

function presentBlocks(
  blocks: Block[],
  facts: AchievementFacts,
  copyById: Map<string, ImageCopy>,
): PublishedBlock[] {
  const published: PublishedBlock[] = []
  for (const block of blocks) {
    if (block.type === "list" || block.type === "formula") continue
    if (block.type === "p") published.push({ type: "p", text: block.text })
    if (block.type === "table") published.push({ type: "table", head: block.head, rows: block.rows })
    if (block.type === "image") {
      const image = facts.images.find((candidate) => candidate.id === block.ref)
      if (!image) throw new HarnessError("C07", `unknown image ${block.ref}`)
      published.push({ type: "image", image: publishedImage(image, copyById) })
    }
    if (block.type === "link") {
      published.push({
        type: "link",
        label: block.label,
        kind: block.ref.kind,
        slug: block.ref.slug,
      })
    }
  }
  return published
}

function imageLines(image: PublishedImage): string[] {
  const lines = [image.alt, image.caption]
  if (image.substituteNote) lines.push(image.substituteNote)
  lines.push(...image.scaleBars)
  if (image.legend) lines.push(image.legend)
  return lines
}

function blockLines(blocks: PublishedBlock[]): string[] {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === "p") lines.push(block.text)
    if (block.type === "table") {
      lines.push(block.head.join(" | "))
      for (const row of block.rows) lines.push(row.join(" | "))
    }
    if (block.type === "image") lines.push(block.image.alt, block.image.caption)
    if (block.type === "link") lines.push(`${block.label} -> ${block.kind}:${block.slug}`)
  }
  return lines
}

function renderOrigin(facts: AchievementFacts, taxonomy: Taxonomy): string {
  const origin = facts.origin
  if (!origin) return ""
  const industry = termLabel(taxonomy, "industries", origin.industry)
  const year = origin.year === undefined ? "" : `${origin.year}年、`
  const ongoing = origin.ongoing ? "以来、継続的にご依頼をいただいています。" : ""
  return `${year}${industry}より、「${origin.request}」とのご相談をいただいたことが、本技術開発のきっかけとなりました。${ongoing}`
}

function tagLabels(tags: AchievementFacts["tags"], taxonomy: Taxonomy): string[] {
  const groups = ["components", "materials", "methods", "purposes", "industries"] as const
  const labels: string[] = []
  for (const group of groups) {
    for (const id of tags[group]) labels.push(termLabel(taxonomy, group, id))
  }
  return labels
}

function renderBlocks(blocks: Block[], copyById: Map<string, ImageCopy>): string[] {
  const published: PublishedBlock[] = []
  for (const block of blocks) {
    if (block.type === "list" || block.type === "formula") continue
    if (block.type === "p") published.push({ type: "p", text: block.text })
    if (block.type === "table") published.push({ type: "table", head: block.head, rows: block.rows })
    if (block.type === "image") {
      const copy = copyById.get(block.ref)
      if (!copy) throw new HarnessError("C07", `caption missing for ${block.ref}`)
      published.push({
        type: "image",
        image: { file: "", alt: copy.alt, caption: copy.caption, scaleBars: [] },
      })
    }
    if (block.type === "link") {
      published.push({ type: "link", label: block.label, kind: block.ref.kind, slug: block.ref.slug })
    }
  }
  return blockLines(published)
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
