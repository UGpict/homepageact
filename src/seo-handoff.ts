import { readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { PublicAchievementSchema } from "./schema.ts"
import { hashText } from "./review.ts"
import { MetadataPatchSchema } from "./application/seo-draft.ts"
import { isFreshSourceTime } from "./application/seo-source-binding.ts"
const Hash = z.string().regex(/^[a-f0-9]{64}$/)
export const SeoHandoffSchema = z.object({
  version: z.literal(1), purpose: z.literal("reviewed-metadata-handoff-not-publication-approval"),
  jobId: z.string().regex(/^job-[a-f0-9]{8}$/), revision: Hash,
  exportedAt: z.string().datetime(), requestedBy: z.string().min(1), exportedBy: z.string().min(1),
  targetPath: z.string(), sourceUrl: z.string(),
  original: PublicAchievementSchema, originalHash: Hash,
  proposal: MetadataPatchSchema, proposedHash: Hash,
  publicSource: z.object({ htmlHash: Hash, fetchedAt: z.string().datetime(), checkedAt: z.string().datetime() }).strict(),
  reviews: z.array(z.object({ claimId: z.string().min(1), reviewer: z.string().min(1), note: z.string().min(1).max(1000), at: z.string().datetime(), sourceCheckedAt: z.string().datetime(), sourceHtmlHash: Hash }).strict()).min(1),
}).strict()
export type SeoHandoff = z.infer<typeof SeoHandoffSchema>
/** Canonical schema parsing ignores JSON whitespace and key order, not content changes. */
export function achievementHash(value: unknown) { return hashText(JSON.stringify(PublicAchievementSchema.parse(value))) }
export function validateSeoHandoff(input: unknown): SeoHandoff {
  const pack = SeoHandoffSchema.parse(input)
  const slug = pack.original.generated.slug
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || pack.targetPath !== `content/achievements/${slug}.json` || pack.sourceUrl !== `https://www.macsystems.co.jp/ts/achievement/${slug}/`) throw new Error("対象パスとページが一致しません。")
  if (pack.exportedBy !== pack.requestedBy || pack.originalHash !== achievementHash(pack.original)) throw new Error("原本または依頼者が一致しません。")
  const proposed = { ...pack.original, generated: { ...pack.original.generated, ...pack.proposal } }
  if (pack.proposedHash !== achievementHash(proposed) || pack.proposedHash === pack.originalHash) throw new Error("修正案の識別情報が一致しません。")
  if (!isFreshSourceTime(pack.publicSource.checkedAt, pack.exportedAt)) throw new Error("書き出し時の公開原本確認が期限切れです。")
  const ids = new Set<string>()
  for (const review of pack.reviews) {
    if (ids.has(review.claimId) || review.reviewer === pack.requestedBy || review.sourceHtmlHash !== pack.publicSource.htmlHash || !isFreshSourceTime(review.sourceCheckedAt, review.at) || Date.parse(review.at) > Date.parse(pack.exportedAt)) throw new Error("技術確認の記録が不正です。")
    ids.add(review.claimId)
  }
  if (!ids.has("seo-source-review")) throw new Error("元データの確認がありません。")
  return pack
}
/** Read-only dry run. This package is not signed and never grants publication permission. */
export function verifySeoHandoff(input: unknown, targetRoot: string) {
  const pack = validateSeoHandoff(input)
  const root = realpathSync(targetRoot)
  const target = realpathSync(path.join(root, pack.targetPath))
  if (!target.startsWith(root + path.sep)) throw new Error("対象ファイルがリポジトリ外を指しています。")
  if (!statSync(target).isFile() || statSync(target).size > 2_000_000) throw new Error("対象JSONのサイズまたは形式が不正です。")
  const original = PublicAchievementSchema.parse(JSON.parse(readFileSync(target, "utf8")))
  if (achievementHash(original) !== pack.originalHash) throw new Error("本番側の元JSONが変更されています。新しい原本から下書きを作り直してください。")
  return { ok: true, mode: "read-only", targetPath: pack.targetPath, changes: Object.entries(pack.proposal).map(([field, after]) => ({ field, before: original.generated[field as keyof typeof pack.proposal], after })), publicationApproved: false, note: "ファイルは変更していません。公開HTMLの再確認・差分確認・対象コミットへの公開承認が別途必要です。" }
}
