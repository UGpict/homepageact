import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { hashText } from "../review.ts"
import { PublicSourceRecordSchema, inspectPublicHtml, getSeoPublicSource, type SeoPublicSource } from "./seo-source.ts"
export const SOURCE_CHECK_MAX_AGE_MS = 30 * 60 * 1000
const CheckSchema = z.object({ sourceRevision: z.string().length(64), checkedAt: z.string().datetime(), latestId: z.string().regex(/^source-[a-f0-9]{16}$/).nullable(), changedEver: z.boolean(), failed: z.boolean() }).strict()
export type SourceCheck = z.infer<typeof CheckSchema>
export type SourceBindingView = {
  baseline: SeoPublicSource | null; latest: SeoPublicSource | null;
  status: "unlinked" | "unchecked" | "unchanged" | "changed" | "failed" | "expired";
  checkedAt: string | null;
}
function missing(error: unknown) { return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT" }
export function readBoundSource(root: string) {
  try {
    const record = PublicSourceRecordSchema.parse(JSON.parse(readFileSync(path.join(root, "origin.json"), "utf8")))
    if (record.snapshot.htmlHash !== hashText(record.html)) throw new Error("紐付けた原本HTMLが変更されています。")
    const extracted = inspectPublicHtml(record.html, record.snapshot.url, record.snapshot.fetchedAt, record.snapshot.id)
    if (JSON.stringify(extracted) !== JSON.stringify(record.snapshot)) throw new Error("紐付けた原本情報が変更されています。")
    return record
  } catch (error) { if (missing(error)) return undefined; throw error }
}
export function readSourceCheck(root: string, sourceRevision: string): SourceCheck | undefined {
  try {
    const check = CheckSchema.parse(JSON.parse(readFileSync(path.join(root, "source-check.json"), "utf8")))
    if (check.sourceRevision !== sourceRevision) throw new Error("原本確認の対象が変更されています。下書きを作り直してください。")
    if (check.failed === (check.latestId !== null)) throw new Error("原本確認の記録が不正です。")
    return check
  } catch (error) { if (missing(error)) return undefined; throw error }
}
export function isFreshSourceTime(at: string, now: string): boolean {
  const age = Date.parse(now) - Date.parse(at)
  return Number.isFinite(age) && age >= 0 && age <= SOURCE_CHECK_MAX_AGE_MS
}
export function sourceBindingView(dataRoot: string, baseline: SeoPublicSource | undefined, check: SourceCheck | undefined, now: string): SourceBindingView {
  const latest = check?.latestId ? getSeoPublicSource(dataRoot, check.latestId)?.snapshot : null
  if (check?.latestId && (!latest || latest.url !== baseline?.url || latest.fetchedAt !== check.checkedAt)) throw new Error("再取得した原本を読み込めません。")
  if (baseline && latest && baseline.htmlHash !== latest.htmlHash && !check?.changedEver) throw new Error("原本の変更記録が不正です。")
  const status = !baseline ? "unlinked" : !check ? "unchecked" : check.changedEver ? "changed" : check.failed ? "failed" : !isFreshSourceTime(check.checkedAt, now) ? "expired" : "unchanged"
  return { baseline: baseline ?? null, latest: latest ?? null, status, checkedAt: check?.checkedAt ?? null }
}
export function writeSourceCheck(root: string, check: SourceCheck) {
  const valid = CheckSchema.parse(check)
  const temporary = path.join(root, `check-${randomBytes(8).toString("hex")}.tmp`)
  try { writeFileSync(temporary, JSON.stringify(valid, null, 2) + "\n", { flag: "wx" }); renameSync(temporary, path.join(root, "source-check.json")) }
  finally { rmSync(temporary, { force: true }) }
}
