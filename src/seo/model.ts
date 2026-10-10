import { z } from "zod"

export const SITE = "https://www.macsystems.co.jp/ts/"
export const MAX_CSV_BYTES = 2_000_000
export function pageUrl(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error("ページURLは https:// から入力してください。") }
  if (url.origin !== new URL(SITE).origin || !url.pathname.startsWith("/ts/") || url.username || url.password || url.hash) {
    throw new Error("対象は https://www.macsystems.co.jp/ts/ 配下のURLです（フラグメント不可）。")
  }
  // Query strings and trailing slashes are intentionally not merged.
  return url.href
}
const Url = z.string().transform((value, ctx) => {
  try { return pageUrl(value) } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message })
    return z.NEVER
  }
})
export function day(value: string): number {
  const ms = Date.parse(value + "T00:00:00Z")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error("実在する日付を入力してください。")
  return ms / 86_400_000
}
const DateText = z.string().refine(value => { try { day(value); return true } catch { return false } }, "日付を確認してください。")
export const PageSchema = z.object({
  url: Url,
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["service", "achievement", "column", "other"]),
  purpose: z.string().trim().max(500),
  businessFit: z.number().int().min(0).max(3).nullable(),
  lastEdited: DateText.nullable(),
}).strict()
export type Page = z.infer<typeof PageSchema>
const MetricSchema = z.object({
  url: Url, clicks: z.number().int().nonnegative(), impressions: z.number().int().nonnegative(),
  position: z.number().finite().min(1).nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.clicks > v.impressions || (v.impressions === 0 && v.position !== null)) ctx.addIssue({ code: "custom", message: "検索指標の値が不整合です。" })
})
export type Metric = z.infer<typeof MetricSchema>
export const PeriodSchema = z.object({
  start: DateText, end: DateText, rows: z.array(MetricSchema).min(1).max(10000),
}).strict().superRefine((v, ctx) => {
  if (v.start > v.end) ctx.addIssue({ code: "custom", message: "開始日は終了日以前にしてください。" })
  if (new Set(v.rows.map(r => r.url)).size !== v.rows.length) ctx.addIssue({ code: "custom", message: "同じURLが複数行あります。ページ別のCSVを使用してください。" })
})
export type Period = z.infer<typeof PeriodSchema>
export const ComparisonSchema = z.object({
  previous: PeriodSchema, current: PeriodSchema,
  filters: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
  importedAt: z.string().datetime(),
}).strict().superRefine((v, ctx) => {
  // Child date validation may already be dirty; refinements must never throw.
  try { [v.current.start, v.current.end, v.previous.start, v.previous.end].forEach(day) } catch { return }
  if (day(v.current.end) - day(v.current.start) !== day(v.previous.end) - day(v.previous.start)) ctx.addIssue({ code: "custom", message: "比較する期間の日数を揃えてください。" })
  if (v.previous.end >= v.current.start) ctx.addIssue({ code: "custom", message: "前期間と今回の期間が重ならないようにしてください。" })
})
export type Comparison = z.infer<typeof ComparisonSchema>
export const WorkspaceSchema = z.object({
  version: z.literal(1), pages: z.array(PageSchema).max(10000),
  comparison: ComparisonSchema.nullable(), demo: z.boolean(),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.pages.map(p => p.url)).size !== v.pages.length) ctx.addIssue({ code: "custom", message: "ページ台帳のURLが重複しています。" })
})
export type Workspace = z.infer<typeof WorkspaceSchema>

// Public URLs identified in the initial site review; labels are editable ledger labels, not scraped titles.
const entries: Array<[string, string, Page["kind"]]> = [
  ["", "TSトップ", "service"], ["flow/", "依頼の流れ", "service"], ["contact/", "お問い合わせ", "service"],
  ["technical/", "技術詳細", "service"], ["iso/", "ISO", "other"], ["iso/uncertainty/", "不確かさ", "other"],
  ["achievement/", "実績一覧", "other"], ["column/", "コラム一覧", "other"],
  ...["bga", "bridge", "wire", "mlcc", "sic", "mosfet-sic", "capacitor-0603", "crimp", "fiber"].map(slug => [`achievement/${slug}/`, slug, "achievement"] as [string, string, Page["kind"]]),
  ...["shrinkage-void", "wire-harness", "crack", "resin-curing", "sic", "resin", "buffing", "hard-to-polish", "chip-size"].map(slug => [`column/${slug}/`, slug, "column"] as [string, string, Page["kind"]]),
]
export function emptyWorkspace(): Workspace {
  return { version: 1, demo: false, comparison: null, pages: entries.map(([slug, title, kind]) => ({ url: SITE + slug, title, kind, purpose: "", businessFit: null, lastEdited: null })) }
}
export function attachComparison(workspace: Workspace, comparison: Comparison): Workspace {
  const parsed = ComparisonSchema.parse(comparison)
  const pages = [...workspace.pages]
  const known = new Set(pages.map(p => p.url))
  for (const row of [...parsed.previous.rows, ...parsed.current.rows]) {
    if (!known.has(row.url)) {
      pages.push({ url: row.url, title: new URL(row.url).pathname, kind: "other", purpose: "", businessFit: null, lastEdited: null })
      known.add(row.url)
    }
  }
  return WorkspaceSchema.parse({ ...workspace, pages, comparison: parsed, demo: false })
}
