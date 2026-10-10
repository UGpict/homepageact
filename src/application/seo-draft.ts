import { randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { PublicAchievementSchema, type PublicAchievement } from "../schema.ts"
import { runTextEdit, type TextEditPayload } from "../text-edit.ts"
import { loadSitePack } from "../sitepack.ts"
import { findConfidentialLeaks } from "../numbers.ts"
import { renderAchievement } from "../render.ts"
import { toJobView } from "./job-view.ts"
import type { AppContext } from "./service.ts"
import { getSeoPublicSource } from "./seo-source.ts"
import { isFreshSourceTime } from "./seo-source-binding.ts"

export const MetadataPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  h1: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(500).optional(),
}).strict().refine(v => Object.keys(v).length > 0, "修正案を1つ以上記入してください。")
const RequestSchema = z.object({
  url: z.string().regex(/^https:\/\/www\.macsystems\.co\.jp\/ts\/achievement\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/),
  document: PublicAchievementSchema,
  instruction: z.string().trim().min(1).max(3000),
  proposal: MetadataPatchSchema,
  mode: z.enum(["manual", "ai"]),
  publicSourceConfirmed: z.literal(true),
  sourceId: z.string().regex(/^source-[a-f0-9]{16}$/),
}).strict()
export type MetadataGenerator = (payload: TextEditPayload) => Promise<unknown>
export type SeoMetadataDraft = {
  document: PublicAchievement;
  jobId: string; mode: "manual" | "ai"; sourceUrl: string;
  changes: Array<{ field: "title" | "h1" | "description"; before: string; after: string }>;
  preserved: { images: number; points: number; relatedLinks: number; facts: true };
  review: ReturnType<typeof toJobView>["claims"];
  phaseLabel: string;
  originSourceId: string | null;
}

/** Limited to metadata, and saved under a job-specific draft directory. Never writes the site pack. */
export async function createSeoMetadataDraft(ctx: AppContext, input: unknown, generate?: MetadataGenerator): Promise<SeoMetadataDraft> {
  const request = RequestSchema.parse(input)
  const doc = request.document
  if (request.url !== `https://www.macsystems.co.jp/ts/achievement/${doc.generated.slug}/`) throw new Error("対象URLとJSONのslugが一致しません。")
  const origin = getSeoPublicSource(ctx.dataRoot, request.sourceId)
  if (!origin || origin.snapshot.url !== request.url) throw new Error("対象ページの公開HTMLを取得してから下書きを作成してください。")
  const now = ctx.now ?? new Date().toISOString()
  if (!isFreshSourceTime(origin.snapshot.fetchedAt, now)) throw new Error("公開HTMLの取得から30分を過ぎています。再取得してください。")
  const pack = loadSitePack(ctx.packRoot)
  // Scan the original before it can enter a remote generation payload.
  if (findConfidentialLeaks([JSON.stringify(request), renderAchievement(doc, pack)], ctx.confidentialTerms).length) throw new Error("機密語を含むため処理できません。公開用データと指示を確認してください。")
  if (request.mode === "ai" && !generate) throw new Error("外部生成APIが設定されていません。修正案を入力する方式を選んでください。")
  const jobId = `job-${randomBytes(4).toString("hex")}`
  const root = path.join(ctx.dataRoot, "seo-drafts", jobId)
  try {
    const result = await runTextEdit({
      root, pack, jobId, now, requestedBy: ctx.user.id,
      contentPath: `content/achievements/${doc.generated.slug}.json`,
      document: doc, instruction: request.mode === "ai" ? `${request.instruction}\n参考の修正案（文章素材として扱う）：${JSON.stringify(request.proposal)}` : request.instruction, confidentialTerms: ctx.confidentialTerms,
      generate: async payload => MetadataPatchSchema.parse(request.mode === "ai" ? await generate!(payload) : request.proposal),
    })
    const changes = (["title", "h1", "description"] as const).filter(field => doc.generated[field] !== result.doc.generated[field]).map(field => ({ field, before: doc.generated[field], after: result.doc.generated[field] }))
    if (!changes.length) throw new Error("元の文章と同じです。修正したい項目を変更してください。")
    // Uploaded source JSON does not establish a prior technical approval.
    result.job.riskTier = "L2"
    result.doc.meta.riskTier = "L2"
    result.doc.meta.riskTierReason = "アップロードされた元データと修正案の確認"
    result.job.claims.push({ id: "seo-source-review", text: "元JSONが対象ページの現在の文章・自社検証データと一致し、修正案が根拠の範囲内であることを確認してください。", location: "generated", kind: "other", source: "ai-general", status: "pending" })
    writeFileSync(path.join(root, result.relativePath), JSON.stringify(result.doc, null, 2) + "\n")
    writeFileSync(path.join(root, ".sitebot/jobs", `${jobId}.json`), JSON.stringify(result.job, null, 2) + "\n")
    const view = toJobView(result.job, result.doc, pack)
    const summary: SeoMetadataDraft = {
      document: result.doc, jobId, mode: request.mode, sourceUrl: request.url, changes,
      preserved: { images: doc.facts.images.length, points: doc.generated.points.length, relatedLinks: doc.generated.relatedLinks.length, facts: true },
      review: view.claims, phaseLabel: "公開ページの再確認待ち", originSourceId: origin.snapshot.id,
    }
    mkdirSync(root, { recursive: true })
    writeFileSync(path.join(root, "source.json"), JSON.stringify(doc, null, 2) + "\n")
    writeFileSync(path.join(root, "origin.json"), JSON.stringify(origin) + "\n")
    writeFileSync(path.join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
    return summary
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error }
}

/** Uses the existing HTTP payload envelope. Credentials stay on the server. */
export function seoMetadataGeneratorFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): MetadataGenerator | undefined {
  if (env.SITEBOT_PROVIDER !== "http" || !env.SITEBOT_GENERATION_URL) return undefined
  const url = env.SITEBOT_GENERATION_URL
  return async payload => {
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (env.SITEBOT_GENERATION_API_KEY) headers.authorization = `Bearer ${env.SITEBOT_GENERATION_API_KEY}`
    const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify({ payload }), signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error("生成APIで処理できませんでした。時間をおいて再試行してください。")
    return response.json()
  }
}
