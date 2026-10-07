import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { HarnessError } from "./errors.ts"
import { jsonPathExists } from "./json-path.ts"
import { findConfidentialLeaks, unsourcedNumbers } from "./numbers.ts"
import { buildAchievementPayload, buildColumnPayload, type GenerationPayload } from "./payload.ts"
import { assertPublishAllowed, expectedPublishPath, resolveInsideRoot } from "./paths.ts"
import { humanStrings, renderAchievement, renderColumn } from "./render.ts"
import type { JobClaim, JobRecord } from "./review.ts"
import {
  AchievementFacts,
  AchievementModelOutput,
  ColumnBrief,
  ColumnModelOutput,
  OutlineSection,
  type ClaimDraft,
  type PublicAchievement,
  type PublicColumn,
} from "./schema.ts"
import type { SitePack } from "./sitepack.ts"

const BANNED_PUBLIC_KEYS = new Set(["review", "finalReview", "commitSha"])

export type Generate = (payload: GenerationPayload) => Promise<unknown>

export type RunAchievementInput = {
  root: string
  pack: SitePack
  jobId: string
  requestedBy: string
  now: string
  today: string
  facts: unknown
  confidentialTerms?: string[]
  chatTranscript?: string
  samples?: Array<{ id: string; excerpt: string }>
  generate: Generate
}

export type RunColumnInput = {
  root: string
  pack: SitePack
  jobId: string
  requestedBy: string
  now: string
  today: string
  brief: unknown
  outline: unknown
  confidentialTerms?: string[]
  chatTranscript?: string
  samples?: Array<{ id: string; excerpt: string }>
  generate: Generate
}

export type AchievementRun = {
  doc: PublicAchievement
  job: JobRecord
  relativePath: string
  payload: GenerationPayload
  preview: string
}

export type ColumnRun = {
  doc: PublicColumn
  job: JobRecord
  relativePath: string
  payload: GenerationPayload
  preview: string
}

/** 既存本文がデータファイルになるまで、text_edit は入口で止める。 */
export function runTextEdit(): never {
  throw new HarnessError(
    "RECIPE_DISABLED",
    "text_edit は既存ページがデータファイルになるまで開始しない",
  )
}

export async function runAchievementJob(input: RunAchievementInput): Promise<AchievementRun> {
  const recipe = assertStructuredRecipe(input.pack, "achievement")
  const facts = parseWith(AchievementFacts, input.facts, "facts")
  assertAchievementRefs(facts)
  const terms = input.confidentialTerms ?? []
  const factLeaks = findConfidentialLeaks(humanStrings(facts), terms)
  if (factLeaks.length > 0) {
    throw new HarnessError("C10", `confidential term in facts: ${factLeaks.join(", ")}`)
  }

  const payload = buildAchievementPayload(facts, {
    pack: input.pack,
    pageIndex: input.pack.pages,
    samples: input.samples ?? [],
    today: input.today,
    styleExcerpt: input.pack.styleExcerpt,
    confidentialTerms: terms,
    chatTranscript: input.chatTranscript,
  })
  const model = parseWith(AchievementModelOutput, await input.generate(payload), "model output")
  assertAchievementModel(facts, model, input.pack)

  const generated: PublicAchievement["generated"] = (({ claims: _claims, ...rest }) => rest)(model)
  const doc: PublicAchievement = {
    meta: meta(input, "achievement", "L2"),
    facts,
    generated,
  }
  assertNoApprovalFields(doc)
  const preview = renderAchievement(doc, input.pack)
  const outputLeaks = findConfidentialLeaks([preview], terms)
  if (outputLeaks.length > 0) {
    throw new HarnessError("C10", `confidential term in output: ${outputLeaks.join(", ")}`)
  }

  const claims = [
    ...model.claims.map(toPending),
    ...numberClaims(
      [preview, ...model.claims.map((claim) => claim.text)].join("\n"),
      achievementSources(facts, input.pack, model.claims),
    ),
  ]
  const relativePath = publish(input.root, input.pack, recipe.output, model.slug, doc)
  const job = writeJob(input.root, {
    jobId: input.jobId,
    recipe: "achievement",
    requestedBy: input.requestedBy,
    contentPath: relativePath,
    claims,
    writtenPaths: [relativePath],
    riskTier: "L2",
  })
  return { doc, job, relativePath, payload, preview }
}

export async function runColumnJob(input: RunColumnInput): Promise<ColumnRun> {
  const recipe = assertStructuredRecipe(input.pack, "column")
  const brief = parseWith(ColumnBrief, input.brief, "brief")
  const outline = parseWith(OutlineSection.array(), input.outline, "outline")
  const terms = input.confidentialTerms ?? []
  const briefLeaks = findConfidentialLeaks(humanStrings(brief), terms)
  if (briefLeaks.length > 0) {
    throw new HarnessError("C10", `confidential term in brief: ${briefLeaks.join(", ")}`)
  }
  for (const link of brief.mustLink) assertKnownPage(link, input.pack)

  const payload = buildColumnPayload(brief, outline, {
    pack: input.pack,
    pageIndex: input.pack.pages,
    samples: input.samples ?? [],
    today: input.today,
    styleExcerpt: input.pack.styleExcerpt,
    confidentialTerms: terms,
    chatTranscript: input.chatTranscript,
  })
  const model = parseWith(ColumnModelOutput, await input.generate(payload), "model output")
  assertColumnModel(brief, outline, model, input.pack)

  const generated: PublicColumn["generated"] = (({ claims: _claims, ...rest }) => rest)(model)
  const doc: PublicColumn = {
    meta: meta(input, "column", "L2"),
    brief,
    outline,
    generated,
  }
  assertNoApprovalFields(doc)
  const preview = renderColumn(doc, input.pack)
  const outputLeaks = findConfidentialLeaks([preview], terms)
  if (outputLeaks.length > 0) {
    throw new HarnessError("C10", `confidential term in output: ${outputLeaks.join(", ")}`)
  }

  const claims = [
    ...model.claims.map(toPending),
    ...numberClaims(
      [preview, ...model.claims.map((claim) => claim.text)].join("\n"),
      columnSources(brief, input.pack, model.claims),
    ),
  ]
  const relativePath = publish(input.root, input.pack, recipe.output, model.slug, doc)
  const job = writeJob(input.root, {
    jobId: input.jobId,
    recipe: "column",
    requestedBy: input.requestedBy,
    contentPath: relativePath,
    claims,
    writtenPaths: [relativePath],
    riskTier: "L2",
  })
  return { doc, job, relativePath, payload, preview }
}

function assertStructuredRecipe(
  pack: SitePack,
  name: "achievement" | "column",
): { output: string } {
  const recipe = pack.recipes[name]
  if (!recipe.enabled) throw new HarnessError("RECIPE_DISABLED", `${name} is disabled`)
  if (recipe.executor !== "structured") {
    throw new HarnessError("EXECUTOR", `${name} must use the structured executor`)
  }
  if (recipe.alsoMayEdit.length > 0) {
    throw new HarnessError("U16", "cross-file edits are disabled until the operation schema exists")
  }
  if (!recipe.output) throw new HarnessError("C23", `${name} has no output template`)
  return { output: recipe.output }
}

function assertAchievementRefs(facts: AchievementFacts): void {
  const ids = new Set<string>()
  for (const image of facts.images) {
    if (ids.has(image.id)) throw new HarnessError("C07", `duplicate image ${image.id}`)
    ids.add(image.id)
  }
  if (facts.heroImage && !ids.has(facts.heroImage)) {
    throw new HarnessError("C07", `hero image ${facts.heroImage} does not exist`)
  }
  const stepIds = new Set<string>()
  for (const step of facts.steps) {
    if (stepIds.has(step.id)) throw new HarnessError("C06", `duplicate step ${step.id}`)
    stepIds.add(step.id)
    for (const imageId of step.images) {
      if (!ids.has(imageId)) throw new HarnessError("C07", `step image ${imageId} does not exist`)
    }
  }
}

function assertAchievementModel(
  facts: AchievementFacts,
  model: AchievementModelOutput,
  pack: SitePack,
): void {
  if (model.points.length !== facts.steps.length) {
    throw new HarnessError("C06", "points must mirror steps")
  }
  for (const [index, step] of facts.steps.entries()) {
    const point = model.points[index]
    if (!point || point.stepId !== step.id) {
      throw new HarnessError("C06", `point ${index} must stay on step ${step.id}`)
    }
    for (const block of point.blocks) {
      if (block.type === "list") {
        for (const item of block.items) {
          if (!step.items.includes(item)) {
            throw new HarnessError("C06", `list item is not in facts: ${item}`)
          }
        }
      }
      if (block.type === "formula" && !step.formulas.some((formula) => formula.text === block.text)) {
        throw new HarnessError("C06", `formula is not in facts: ${block.text}`)
      }
      if (block.type === "image" && !facts.images.some((image) => image.id === block.ref)) {
        throw new HarnessError("C07", `unknown image ${block.ref}`)
      }
      if (block.type === "link") assertKnownPage(block.ref, pack)
    }
  }
  assertSameIds(
    facts.images.map((image) => image.id),
    model.images.map((image) => image.id),
  )
  for (const link of model.relatedLinks) assertKnownPage(link.ref, pack)
  const locations = new Set([...facts.steps.map((step) => step.id), ...facts.images.map((image) => image.id)])
  for (const claim of model.claims) {
    if (!locations.has(claim.location)) {
      throw new HarnessError("C20", `claim location is not a step or image: ${claim.location}`)
    }
    assertClaimSource(claim, facts, "facts", pack)
  }
}

function assertColumnModel(
  brief: ColumnBrief,
  outline: OutlineSection[],
  model: ColumnModelOutput,
  pack: SitePack,
): void {
  if (model.sections.length !== outline.length) {
    throw new HarnessError("C06", "sections must mirror the approved outline")
  }
  for (const [index, section] of outline.entries()) {
    const body = model.sections[index]
    if (!body || body.outlineId !== section.id) {
      throw new HarnessError("C06", `section ${index} must stay on outline ${section.id}`)
    }
  }
  assertSameIds(
    brief.images.map((image) => image.id),
    model.images.map((image) => image.id),
  )
  for (const link of model.relatedLinks) assertKnownPage(link.ref, pack)
  const locations = new Set([
    ...outline.map((section) => section.id),
    ...brief.images.map((image) => image.id),
  ])
  for (const claim of model.claims) {
    if (!locations.has(claim.location)) {
      throw new HarnessError("C20", `claim location is not a section or image: ${claim.location}`)
    }
    assertClaimSource(claim, brief, "brief", pack)
  }
}

function assertClaimSource(
  claim: ClaimDraft,
  root: unknown,
  prefix: "facts" | "brief",
  pack: SitePack,
): void {
  if (claim.source === "facts" || claim.source === "brief") {
    if (claim.source !== prefix || !claim.sourceRef || !jsonPathExists(root, claim.sourceRef, prefix)) {
      throw new HarnessError("C20", `sourceRef does not exist: ${claim.sourceRef ?? ""}`)
    }
  }
  if (claim.source === "claims" && !pack.claims.some((entry) => entry.id === claim.sourceRef)) {
    throw new HarnessError("C20", `claims ref does not exist: ${claim.sourceRef ?? ""}`)
  }
  if (
    claim.source === "verified" &&
    !pack.verifiedClaims.some((entry) => entry.id === claim.sourceRef)
  ) {
    throw new HarnessError("C20", `verified ref does not exist: ${claim.sourceRef ?? ""}`)
  }
}

function assertKnownPage(ref: { kind: string; slug: string }, pack: SitePack): void {
  if (!pack.pages.some((page) => page.kind === ref.kind && page.slug === ref.slug)) {
    throw new HarnessError("C08", `unknown page ${ref.kind}:${ref.slug}`)
  }
}

function assertSameIds(expected: string[], actual: string[]): void {
  const left = [...expected].sort().join(",")
  const right = [...actual].sort().join(",")
  if (left !== right) throw new HarnessError("C07", "image ids do not match the human input")
}

export function achievementSources(facts: AchievementFacts, pack: SitePack, claims: ClaimDraft[]): string {
  const parts: string[] = [facts.challenge, facts.outcome, ...facts.scopeNotes]
  if (facts.clientPurpose) parts.push(facts.clientPurpose)
  if (facts.origin) {
    if (facts.origin.year !== undefined) parts.push(String(facts.origin.year))
    parts.push(facts.origin.request)
  }
  for (const step of facts.steps) {
    parts.push(step.memo, ...step.items, ...step.scopeNotes)
    for (const formula of step.formulas) parts.push(formula.text, formula.note ?? "")
  }
  for (const image of facts.images) {
    parts.push(image.memo, image.substituteNote ?? "", image.legend ?? "", ...image.scaleBars)
  }
  parts.push(...catalogTexts(pack, facts.claimIds, claims))
  return parts.join("\n")
}

function columnSources(brief: ColumnBrief, pack: SitePack, claims: ClaimDraft[]): string {
  const parts: string[] = [
    brief.targetQuery,
    brief.readerSituation,
    ...brief.queryVariants,
    ...brief.references,
    ...brief.houseStances.flatMap((stance) => [stance.statement, stance.reason]),
  ]
  for (const image of brief.images) {
    parts.push(image.memo, image.substituteNote ?? "", image.legend ?? "", ...image.scaleBars)
  }
  parts.push(...catalogTexts(pack, brief.claimIds, claims))
  return parts.join("\n")
}

function catalogTexts(pack: SitePack, claimIds: string[], claims: ClaimDraft[]): string[] {
  const texts: string[] = []
  for (const id of claimIds) texts.push(requireClaim(pack, id))
  for (const claim of claims) {
    if (claim.source === "claims" && claim.sourceRef) texts.push(requireClaim(pack, claim.sourceRef))
    if (claim.source === "verified" && claim.sourceRef) {
      const verified = pack.verifiedClaims.find((entry) => entry.id === claim.sourceRef)
      if (!verified) throw new HarnessError("C20", `verified ref does not exist: ${claim.sourceRef}`)
      texts.push(verified.statement, ...verified.approvedExpressions)
    }
  }
  return texts
}

function requireClaim(pack: SitePack, id: string): string {
  const claim = pack.claims.find((entry) => entry.id === id)
  if (!claim) throw new HarnessError("C20", `unknown claim ${id}`)
  return claim.text
}

export function numberClaims(preview: string, sources: string): JobClaim[] {
  return unsourcedNumbers(preview, sources).map((token, index) => ({
    id: `c12-${token.replaceAll(".", "-")}-${index}`,
    text: `数値 ${token} の出典が facts / brief / claims / verified-claims にない`,
    location: "generated",
    kind: "number" as const,
    source: "ai-general" as const,
    status: "pending" as const,
  }))
}

function toPending(draft: ClaimDraft): JobClaim {
  return {
    id: draft.id,
    text: draft.text,
    location: draft.location,
    kind: draft.kind,
    source: draft.source,
    sourceRef: draft.sourceRef,
    status: "pending",
  }
}

function meta(
  input: { jobId: string; requestedBy: string; now: string },
  recipe: "achievement" | "column",
  riskTier: "L1" | "L2",
): PublicAchievement["meta"] {
  return {
    id: input.jobId,
    recipe,
    status: "draft",
    requestedBy: input.requestedBy,
    createdAt: input.now,
    updatedAt: input.now,
    customerDisclosure: "anonymous",
    riskTier,
  }
}

function publish(
  root: string,
  pack: SitePack,
  template: string,
  slug: string,
  doc: unknown,
): string {
  const relativePath = expectedPublishPath(template, slug)
  assertPublishAllowed(relativePath, pack.allowedPaths, pack.forbiddenPaths)
  const target = resolveInsideRoot(root, relativePath)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(doc, null, 2) + "\n")
  return relativePath
}

function writeJob(root: string, job: JobRecord): JobRecord {
  const relative = `.sitebot/jobs/${job.jobId}.json`
  const target = resolveInsideRoot(root, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(job, null, 2) + "\n")
  return job
}

function assertNoApprovalFields(value: unknown): void {
  walk(value)
  function walk(current: unknown): void {
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (!current || typeof current !== "object") return
    for (const [key, child] of Object.entries(current)) {
      if (BANNED_PUBLIC_KEYS.has(key)) {
        throw new HarnessError("C18", `public content contains ${key}`)
      }
      walk(child)
    }
  }
}

function parseWith<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }, input: unknown, label: string): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new HarnessError("C05", `${label}: ${result.error.message}`)
  return result.data
}
