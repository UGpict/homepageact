import { parse, type DefaultTreeAdapterMap } from "parse5"
import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { hashText } from "../review.ts"

export const PublicSourceUrl = z.string().regex(/^https:\/\/www\.macsystems\.co\.jp\/ts\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/)
const SourceId = z.string().regex(/^source-[a-f0-9]{16}$/)
const SnapshotSchema = z.object({
  id: SourceId, url: PublicSourceUrl, fetchedAt: z.string().datetime(), htmlHash: z.string().length(64),
  title: z.string(), description: z.string(), h1: z.array(z.string()), canonical: z.array(z.string()), robots: z.array(z.string()),
  headings: z.array(z.object({ level: z.number().int().min(1).max(6), text: z.string() })),
  images: z.array(z.object({ src: z.string(), alt: z.string() })), tables: z.number().int().nonnegative(), embeds: z.number().int().nonnegative(),
}).strict()
export const PublicSourceRecordSchema = z.object({ snapshot: SnapshotSchema, html: z.string().max(2_000_000) }).strict()
const RecordSchema = PublicSourceRecordSchema
export type SeoPublicSource = z.infer<typeof SnapshotSchema>
type Node = DefaultTreeAdapterMap["node"]
function children(node: Node): Node[] { return "childNodes" in node ? node.childNodes : [] }
function text(node: Node): string {
  if ("tagName" in node && ["script", "style", "template"].includes(node.tagName)) return ""
  if (node.nodeName === "#text" && "value" in node) return node.value
  return children(node).map(text).join("")
}
function clean(value: string) { return value.replace(/\s+/g, " ").trim() }
/** HTML parser only: no script execution, external image requests, or inference of experimental facts. */
export function inspectPublicHtml(html: string, url: string, fetchedAt: string, id = `source-${randomBytes(8).toString("hex")}`): SeoPublicSource {
  PublicSourceUrl.parse(url)
  const result: SeoPublicSource = { id, url, fetchedAt, htmlHash: hashText(html), title: "", description: "", h1: [], canonical: [], robots: [], headings: [], images: [], tables: 0, embeds: 0 }
  let titles = 0, descriptions = 0
  function walk(node: Node, inHead = false) {
    if ("tagName" in node) {
      const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]))
      const name = node.tagName
      if (name === "head") inHead = true
      if (inHead && name === "title" && node.namespaceURI === "http://www.w3.org/1999/xhtml") { titles++; result.title = clean(text(node)) }
      if (inHead && name === "meta" && attrs.name?.toLowerCase() === "description") { descriptions++; result.description = attrs.content ?? "" }
      if (inHead && name === "meta" && ["robots", "googlebot"].includes(attrs.name?.toLowerCase() ?? "")) result.robots.push(attrs.content ?? "")
      if (inHead && name === "link" && attrs.rel?.toLowerCase().split(/\s+/).includes("canonical")) result.canonical.push(attrs.href ?? "")
      if (/^h[1-6]$/.test(name)) { const value = clean(text(node)); result.headings.push({ level: Number(name[1]), text: value }); if (name === "h1") result.h1.push(value) }
      if (name === "img") result.images.push({ src: attrs.src ?? "", alt: attrs.alt ?? "" })
      if (name === "table") result.tables++
      if (["iframe", "video", "object", "embed"].includes(name)) result.embeds++
    }
    children(node).forEach(child => walk(child, inHead))
  }
  // The stored bytes retain BOM; a leading BOM is an encoding marker, not body text.
  walk(parse(html.replace(/^\uFEFF/, "")))
  if (titles > 1 || descriptions > 1) throw new Error("タイトルまたは説明文が重複しています。元HTMLを確認してください。")
  return SnapshotSchema.parse(result)
}
function missing(error: unknown) { return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT" }
/** Only fixed HTTPS TS URLs, no redirects, credentials, query strings, or request to another host. */
export async function importSeoPublicSource(dataRoot: string, input: unknown, fetchImpl: typeof fetch = fetch, now = new Date().toISOString()): Promise<SeoPublicSource> {
  const { url } = z.object({ url: PublicSourceUrl }).strict().parse(input)
  const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { accept: "text/html" } })
  if (!response.ok) throw new Error(`公開ページを取得できませんでした（HTTP ${response.status}）。`)
  if (response.url && response.url !== url) throw new Error("取得先が変わりました。URLを確認してください。")
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("HTMLページではないため取り込めません。")
  if (Number(response.headers.get("content-length")) > 2_000_000) { await response.body?.cancel(); throw new Error("公開HTMLが2MBを超えています。") }
  const reader = response.body?.getReader()
  if (!reader) throw new Error("公開HTMLが空です。")
  let size = 0; const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read(); if (done) break
    size += value.length
    if (size > 2_000_000) { await reader.cancel(); throw new Error("公開HTMLが2MBを超えています。") }
    chunks.push(value)
  }
  const html = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks))
  if (!html.trim()) throw new Error("公開HTMLが空です。")
  const snapshot = inspectPublicHtml(html, url, now)
  const record = RecordSchema.parse({ snapshot, html })
  const root = path.join(dataRoot, "seo-sources")
  mkdirSync(root, { recursive: true })
  writeFileSync(path.join(root, `${snapshot.id}.json`), JSON.stringify(record), { flag: "wx" })
  return snapshot
}
export function getSeoPublicSource(dataRoot: string, id: string): z.infer<typeof RecordSchema> | undefined {
  if (!SourceId.safeParse(id).success) return undefined
  try {
    const record = RecordSchema.parse(JSON.parse(readFileSync(path.join(dataRoot, "seo-sources", `${id}.json`), "utf8")))
    if (record.snapshot.id !== id || record.snapshot.htmlHash !== hashText(record.html)) throw new Error("保存した公開HTMLが変更されています。再取得してください。")
    return { ...record, snapshot: inspectPublicHtml(record.html, record.snapshot.url, record.snapshot.fetchedAt, id) }
  } catch (error) { if (missing(error)) return undefined; throw error }
}
export function listSeoPublicSources(dataRoot: string): { sources: SeoPublicSource[]; unreadable: number } {
  let files: string[]
  try { files = readdirSync(path.join(dataRoot, "seo-sources")) }
  catch (error) { if (missing(error)) return { sources: [], unreadable: 0 }; throw error }
  const sources: SeoPublicSource[] = []; let unreadable = 0
  for (const file of files) {
    const id = file.replace(/\.json$/, "")
    if (!SourceId.safeParse(id).success || file !== `${id}.json`) continue
    try { const record = getSeoPublicSource(dataRoot, id); if (record) sources.push(record.snapshot); else unreadable++ }
    catch { unreadable++ }
  }
  return { sources: sources.sort((a,b) => b.fetchedAt.localeCompare(a.fetchedAt)), unreadable }
}
