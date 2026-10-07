import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { classifyTextEdit } from "./classify.ts"
import { HarnessError } from "./errors.ts"
import { findConfidentialLeaks } from "./numbers.ts"
import { assertPublishAllowed, resolveInsideRoot } from "./paths.ts"
import { renderAchievement } from "./render.ts"
import { invalidateLocation, type JobClaim, type JobRecord } from "./review.ts"
import { achievementSources, numberClaims } from "./run-job.ts"
import {
  PublicAchievementSchema,
  SectionRewriteOutput,
  TextEditOutput,
  type PublicAchievement,
  type SectionRewriteOutput as SectionRewrite,
  type TextEditOutput as TextPatch,
} from "./schema.ts"
import type { SitePack } from "./sitepack.ts"

const BANNED_PUBLIC_KEYS = new Set(["review", "finalReview", "commitSha"])

export type TextEditPayload = {
  recipe: "text_edit"
  instruction: string
  current: PublicAchievement["generated"]
  outputSchema: "TextEditOutput"
}

export type SectionRewritePayload = {
  recipe: "section_rewrite"
  stepId: string
  correction: string
  current: PublicAchievement["generated"]["points"][number]
  outputSchema: "SectionRewriteOutput"
}

type EditContext = {
  root: string
  pack: SitePack
  jobId: string
  requestedBy: string
  now: string
  contentPath: string
  confidentialTerms?: string[]
  chatTranscript?: string
}

export async function runTextEdit(
  input: EditContext & {
    document: unknown
    instruction: string
    generate: (payload: TextEditPayload) => Promise<unknown>
  },
): Promise<{
  doc: PublicAchievement
  job: JobRecord
  relativePath: string
  payload: TextEditPayload
  preview: string
  tier: "L1" | "L2"
}> {
  assertTextEditEnabled(input.pack)
  const current = parseDocument(input.document)
  const relativePath = assertSameContentPath(current, input.contentPath)
  const terms = input.confidentialTerms ?? []
  if (findConfidentialLeaks([input.instruction], terms).length > 0) {
    throw new HarnessError("C10", "confidential term in the edit instruction")
  }

  const payload = buildTextEditPayload(current, input.instruction, input.chatTranscript)
  const patch = parseWith(TextEditOutput, await input.generate(payload), "text edit")
  const edited = applyTextEdit(current, patch, input.now)
  assertFactsUntouched(current, edited)
  assertNoApprovalFields(edited)

  const before = renderAchievement(current, input.pack)
  const preview = renderAchievement(edited, input.pack)
  if (findConfidentialLeaks([preview], terms).length > 0) {
    throw new HarnessError("C10", "confidential term in the edited page")
  }

  const decision = classifyTextEdit(before, preview)
  const riskTier = decision.tier
  edited.meta.riskTier = riskTier
  if (riskTier === "L2") edited.meta.riskTierReason = decision.reason

  const claims = [
    ...numberClaims(preview, achievementSources(edited.facts, input.pack, [])),
    ...(riskTier === "L2" ? [tierClaim(decision.reason)] : []),
  ]
  writeJson(input.root, input.pack, relativePath, edited)
  const job = writeJob(input.root, {
    jobId: input.jobId,
    recipe: "text_edit",
    requestedBy: input.requestedBy,
    contentPath: relativePath,
    claims,
    writtenPaths: [relativePath],
    riskTier,
  })
  return { doc: edited, job, relativePath, payload, preview, tier: riskTier }
}

export async function rewriteAchievementSection(
  input: EditContext & {
    document: unknown
    stepId: string
    correction: string
    claims: JobClaim[]
    generate: (payload: SectionRewritePayload) => Promise<unknown>
  },
): Promise<{
  doc: PublicAchievement
  job: JobRecord
  relativePath: string
  payload: SectionRewritePayload
  preview: string
}> {
  assertTextEditEnabled(input.pack)
  const current = parseDocument(input.document)
  const relativePath = assertSameContentPath(current, input.contentPath)
  const step = current.facts.steps.find((candidate) => candidate.id === input.stepId)
  const point = current.generated.points.find((candidate) => candidate.stepId === input.stepId)
  if (!step || !point) throw new HarnessError("C06", `unknown step ${input.stepId}`)
  const terms = input.confidentialTerms ?? []
  if (findConfidentialLeaks([input.correction], terms).length > 0) {
    throw new HarnessError("C10", "confidential term in the correction")
  }

  const payload: SectionRewritePayload = {
    recipe: "section_rewrite",
    stepId: input.stepId,
    correction: input.correction,
    current: point,
    outputSchema: "SectionRewriteOutput",
  }
  void input.chatTranscript
  const rewritten = parseWith(SectionRewriteOutput, await input.generate(payload), "section rewrite")
  if (rewritten.stepId !== input.stepId) {
    throw new HarnessError("C06", "rewrite returned a different step")
  }
  assertBlocksStayInsideFacts(step, rewritten.blocks)

  const nextPoints = current.generated.points.map((existing) =>
    existing.stepId === input.stepId
      ? { stepId: rewritten.stepId, title: rewritten.title, blocks: rewritten.blocks }
      : existing,
  )
  const edited: PublicAchievement = {
    ...current,
    meta: {
      ...current.meta,
      updatedAt: input.now,
      riskTier: "L2",
      riskTierReason: "確認後のセクション書き直し",
    },
    facts: current.facts,
    generated: { ...current.generated, points: nextPoints },
  }
  assertFactsUntouched(current, edited)
  assertOtherPointsUntouched(current, edited, input.stepId)
  assertNoApprovalFields(edited)

  const preview = renderAchievement(edited, input.pack)
  if (findConfidentialLeaks([preview], terms).length > 0) {
    throw new HarnessError("C10", "confidential term in the rewritten section")
  }

  const invalidated = invalidateLocation({ ...emptyJob(input, relativePath), claims: input.claims }, input.stepId)
  const claims = [
    ...invalidated.claims,
    ...numberClaims(preview, achievementSources(edited.facts, input.pack, [])),
  ]
  if (!claims.some((claim) => claim.location === input.stepId && claim.status === "pending")) {
    claims.push({
      id: `c21-${input.stepId}`,
      text: input.correction,
      location: input.stepId,
      kind: "other",
      source: "ai-general",
      status: "pending",
    })
  }

  writeJson(input.root, input.pack, relativePath, edited)
  const job = writeJob(input.root, {
    ...emptyJob(input, relativePath),
    claims,
    riskTier: "L2",
  })
  return { doc: edited, job, relativePath, payload, preview }
}

function buildTextEditPayload(
  doc: PublicAchievement,
  instruction: string,
  chatTranscript: string | undefined,
): TextEditPayload {
  void chatTranscript
  return {
    recipe: "text_edit",
    instruction,
    current: doc.generated,
    outputSchema: "TextEditOutput",
  }
}

function applyTextEdit(doc: PublicAchievement, patch: TextPatch, now: string): PublicAchievement {
  const generated = { ...doc.generated }
  assignIfPresent(generated, patch, [
    "title",
    "h1",
    "shortTitle",
    "listingSummary",
    "lead",
    "description",
    "ogImageAlt",
    "solutionHeadline",
    "solutionBody",
  ])
  if (patch.points) {
    if (patch.points.length !== doc.facts.steps.length) {
      throw new HarnessError("C06", "text edit must keep every point")
    }
    for (const [index, step] of doc.facts.steps.entries()) {
      const point = patch.points[index]
      if (!point || point.stepId !== step.id) {
        throw new HarnessError("C06", `point ${index} must stay on step ${step.id}`)
      }
      assertBlocksStayInsideFacts(step, point.blocks)
    }
    generated.points = patch.points
  }
  if (patch.images) {
    const expected = doc.facts.images.map((image) => image.id).sort().join(",")
    const actual = patch.images.map((image) => image.id).sort().join(",")
    if (expected !== actual) throw new HarnessError("C07", "image ids do not match the human input")
    generated.images = patch.images
  }
  return {
    ...doc,
    meta: { ...doc.meta, updatedAt: now },
    facts: doc.facts,
    generated,
  }
}

function assertBlocksStayInsideFacts(
  step: PublicAchievement["facts"]["steps"][number],
  blocks: SectionRewrite["blocks"],
): void {
  for (const block of blocks) {
    if (block.type === "list") {
      for (const item of block.items) {
        if (!step.items.includes(item)) throw new HarnessError("C06", `list item is not in facts: ${item}`)
      }
    }
    if (block.type === "formula" && !step.formulas.some((formula) => formula.text === block.text)) {
      throw new HarnessError("C06", `formula is not in facts: ${block.text}`)
    }
  }
}

function assertOtherPointsUntouched(
  before: PublicAchievement,
  after: PublicAchievement,
  stepId: string,
): void {
  const unchangedKeys = Object.keys(before.generated).filter((key) => key !== "points")
  for (const key of unchangedKeys) {
    const left = before.generated[key as keyof typeof before.generated]
    const right = after.generated[key as keyof typeof after.generated]
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      throw new HarnessError("C06", `rewrite changed ${key} outside the section`)
    }
  }
  for (const point of before.generated.points) {
    if (point.stepId === stepId) continue
    const next = after.generated.points.find((candidate) => candidate.stepId === point.stepId)
    if (JSON.stringify(point) !== JSON.stringify(next)) {
      throw new HarnessError("C06", `rewrite changed point ${point.stepId}`)
    }
  }
}

function assertFactsUntouched(before: PublicAchievement, after: PublicAchievement): void {
  if (JSON.stringify(before.facts) !== JSON.stringify(after.facts)) {
    throw new HarnessError("C06", "text edit changed facts")
  }
}

function assertSameContentPath(doc: PublicAchievement, contentPath: string): string {
  const expected = `content/achievements/${doc.generated.slug}.json`
  if (contentPath !== expected) {
    throw new HarnessError("C23", "text edit path is not the existing document")
  }
  return expected
}

function assertTextEditEnabled(pack: SitePack): void {
  const recipe = pack.recipes.text_edit
  if (!recipe.enabled) throw new HarnessError("RECIPE_DISABLED", "text_edit is disabled")
  if (recipe.executor !== "structured") {
    throw new HarnessError("EXECUTOR", "text_edit must use the structured executor")
  }
  if (recipe.alsoMayEdit.length > 0) {
    throw new HarnessError("U16", "cross-file edits are disabled until the operation schema exists")
  }
}

function tierClaim(reason: string): JobClaim {
  return {
    id: "c21-diff",
    text: reason,
    location: "generated",
    kind: "other",
    source: "ai-general",
    status: "pending",
  }
}

function emptyJob(input: EditContext, relativePath: string): JobRecord {
  return {
    jobId: input.jobId,
    recipe: "text_edit",
    requestedBy: input.requestedBy,
    contentPath: relativePath,
    claims: [],
    writtenPaths: [relativePath],
    riskTier: "L2",
  }
}

function assignIfPresent<T extends object>(target: T, patch: object, keys: Array<keyof T & string>): void {
  const source = patch as Record<string, unknown>
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key] as T[typeof key]
  }
}

function parseDocument(input: unknown): PublicAchievement {
  return parseWith(PublicAchievementSchema, input, "document")
}

function parseWith<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false; error: { message: string } }
  },
  input: unknown,
  label: string,
): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new HarnessError("C05", `${label}: ${result.error.message}`)
  return result.data
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
      if (BANNED_PUBLIC_KEYS.has(key)) throw new HarnessError("C18", `public content contains ${key}`)
      walk(child)
    }
  }
}

function writeJson(root: string, pack: SitePack, relativePath: string, doc: unknown): void {
  assertPublishAllowed(relativePath, pack.allowedPaths, pack.forbiddenPaths)
  const target = resolveInsideRoot(root, relativePath)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(doc, null, 2) + "\n")
}

function writeJob(root: string, job: JobRecord): JobRecord {
  const target = resolveInsideRoot(root, `.sitebot/jobs/${job.jobId}.json`)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(job, null, 2) + "\n")
  return job
}
