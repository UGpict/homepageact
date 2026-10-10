import { readFileSync, readdirSync, writeFileSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { PublicAchievementSchema } from "../schema.ts"
import { hashText, recordTechnicalDecision, type JobRecord } from "../review.ts"
import { findConfidentialLeaks } from "../numbers.ts"
import { loadSitePack } from "../sitepack.ts"
import { toJobView } from "./job-view.ts"
import { StoredJob } from "./repository.ts"
import type { AppContext } from "./service.ts"
import type { SeoMetadataDraft } from "./seo-draft.ts"

const JobId = z.string().regex(/^job-[a-f0-9]{8}$/)
const JobSchema = StoredJob.extend({ recipe: z.literal("text_edit") })
const EntrySchema = z.object({
  claimId: z.string().min(1).max(200), decision: z.enum(["confirmed", "needs_changes"]),
  reviewer: z.string().min(1), note: z.string().trim().min(1).max(1000), at: z.string().datetime(),
}).strict()
const AuditSchema = z.object({ sourceRevision: z.string().length(64), entries: z.array(EntrySchema).max(1000) }).strict()
const InputSchema = z.object({
  revision: z.string().length(64), claimId: z.string().min(1).max(200),
  decision: z.enum(["confirmed", "needs_changes"]), note: z.string().trim().min(1).max(1000),
}).strict()
export type SeoDraftReview = SeoMetadataDraft & {
  revision: string; createdAt: string; requestedBy: string; pendingCount: number;
  canReview: boolean; history: Array<z.infer<typeof EntrySchema>>;
}
export type SeoDraftListItem = Pick<SeoDraftReview, "jobId" | "sourceUrl" | "createdAt" | "phaseLabel" | "pendingCount"> & { title: string }
type Context = Pick<AppContext, "dataRoot" | "packRoot" | "user" | "now" | "confidentialTerms">
function missing(error: unknown) { return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT" }
function json(file: string): unknown { return JSON.parse(readFileSync(file, "utf8")) }

/** Read authoritative content and job files; cached summary is never trusted as review state. */
function readState(ctx: Context, jobId: string) {
  if (!JobId.safeParse(jobId).success) return undefined
  const root = path.join(ctx.dataRoot, "seo-drafts", jobId)
  let rawJob: unknown
  try { rawJob = json(path.join(root, ".sitebot/jobs", `${jobId}.json`)) }
  catch (error) { if (missing(error)) return undefined; throw error }
  const job = JobSchema.parse(rawJob)
  if (job.jobId !== jobId) throw new Error("下書きの作業IDが一致しません。")
  if (job.riskTier !== "L2" || !job.claims.some(c => c.id === "seo-source-review")) throw new Error("元データの確認項目がないため読み込めません。")
  const document = PublicAchievementSchema.parse(json(path.join(root, job.contentPath)))
  const source = PublicAchievementSchema.parse(json(path.join(root, "source.json")))
  if (job.contentPath !== `content/achievements/${document.generated.slug}.json` || source.generated.slug !== document.generated.slug) throw new Error("下書きの対象ページが一致しません。")
  const withoutMetadata = (generated: typeof document.generated) => { const { title, h1, description, ...rest } = generated; return rest }
  if (JSON.stringify(source.facts) !== JSON.stringify(document.facts) || JSON.stringify(withoutMetadata(source.generated)) !== JSON.stringify(withoutMetadata(document.generated))) throw new Error("元の写真・工程・事実データが変更されています。")
  const mode = z.object({ mode: z.enum(["manual", "ai"]) }).parse(json(path.join(root, "summary.json"))).mode
  const sourceRevision = hashText(JSON.stringify({ job, document, source }))
  let audit: z.infer<typeof AuditSchema> = { sourceRevision, entries: [] }
  try { audit = AuditSchema.parse(json(path.join(root, "review.json"))) }
  catch (error) { if (!missing(error)) throw error }
  if (audit.sourceRevision !== sourceRevision) throw new Error("保存後に下書きが変更されています。技術確認を引き継げないため、下書きを作り直してください。")
  let reviewedJob: JobRecord = job
  for (const entry of audit.entries) {
    if (!job.claims.some(c => c.id === entry.claimId) || entry.reviewer === job.requestedBy) throw new Error("確認記録が不正です。")
    if (entry.decision === "confirmed") reviewedJob = recordTechnicalDecision(reviewedJob, { claimId: entry.claimId, reviewer: entry.reviewer, now: entry.at })
    else reviewedJob = { ...reviewedJob, claims: reviewedJob.claims.map(c => c.id !== entry.claimId ? c : { id: c.id, text: c.text, location: c.location, kind: c.kind, source: c.source, sourceRef: c.sourceRef, status: "pending" as const }) }
  }
  const view = toJobView(reviewedJob, document, loadSitePack(ctx.packRoot))
  const changes = (["title", "h1", "description"] as const).filter(f => source.generated[f] !== document.generated[f]).map(field => ({ field, before: source.generated[field], after: document.generated[field] }))
  const detail: SeoDraftReview = {
    document, jobId, sourceUrl: `https://www.macsystems.co.jp/ts/achievement/${document.generated.slug}/`,
    mode, changes,
    preserved: { images: source.facts.images.length, points: source.generated.points.length, relatedLinks: source.generated.relatedLinks.length, facts: true },
    review: view.claims, phaseLabel: view.phaseLabel, pendingCount: view.pendingCount,
    revision: hashText(JSON.stringify({ sourceRevision, audit })), createdAt: document.meta.updatedAt, requestedBy: job.requestedBy,
    canReview: ctx.user.roles.includes("technical-reviewer") && ctx.user.id !== job.requestedBy,
    history: audit.entries,
  }
  return { root, audit, detail }
}
export function getSeoDraftReview(ctx: Context, jobId: string): SeoDraftReview | undefined { return readState(ctx, jobId)?.detail }
export function listSeoDrafts(ctx: Context): { drafts: SeoDraftListItem[]; unreadable: number } {
  let names: string[]
  try { names = readdirSync(path.join(ctx.dataRoot, "seo-drafts")) }
  catch (error) { if (missing(error)) return { drafts: [], unreadable: 0 }; throw error }
  const drafts: SeoDraftListItem[] = []; let unreadable = 0
  for (const name of names.filter(n => JobId.safeParse(n).success)) {
    try {
      const detail = getSeoDraftReview(ctx, name)
      if (!detail) { unreadable++; continue }
      const { jobId, sourceUrl, createdAt, phaseLabel, pendingCount } = detail
      drafts.push({ jobId, sourceUrl, createdAt, phaseLabel, pendingCount, title: detail.document.generated.title })
    } catch { unreadable++ }
  }
  return { drafts: drafts.sort((a,b) => b.createdAt.localeCompare(a.createdAt)), unreadable }
}
/** Synchronous read/check/atomic replace in the single-server file store; no publication approval. */
export function recordSeoDraftReview(ctx: Context, jobId: string, input: unknown): SeoDraftReview {
  const request = InputSchema.parse(input)
  const state = readState(ctx, jobId)
  if (!state) throw new Error("下書きが見つかりません。")
  if (!state.detail.canReview) throw new Error("依頼者とは別の技術確認担当者が記録してください。")
  if (request.revision !== state.detail.revision) throw new Error("確認記録が更新されています。ページを再読み込みして確認してください。")
  if (!state.detail.review.some(c => c.detail.id === request.claimId)) throw new Error("確認項目が見つかりません。")
  if (findConfidentialLeaks([request.note], ctx.confidentialTerms).length) throw new Error("確認メモに機密語を含めないでください。")
  const entry = EntrySchema.parse({ claimId: request.claimId, decision: request.decision, note: request.note, reviewer: ctx.user.id, at: ctx.now ?? new Date().toISOString() })
  const audit = AuditSchema.parse({ ...state.audit, entries: [...state.audit.entries, entry] })
  const temporary = path.join(state.root, `review-${randomBytes(8).toString("hex")}.tmp`)
  try { writeFileSync(temporary, JSON.stringify(audit, null, 2) + "\n", { flag: "wx" }); renameSync(temporary, path.join(state.root, "review.json")) }
  finally { rmSync(temporary, { force: true }) }
  return getSeoDraftReview(ctx, jobId)!
}
