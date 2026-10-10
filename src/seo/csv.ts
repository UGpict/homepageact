import { MAX_CSV_BYTES, pageUrl, type Metric } from "./model.ts"

/** RFC4180-style parser: BOM, escaped quotes, quoted commas/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error("CSVは2MB以下にしてください。")
  text = text.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = [], cell = "", quoted = false, closed = false
  function pushCell() { row.push(cell.trim()); cell = ""; closed = false }
  function pushRow() { pushCell(); if (row.some(Boolean)) rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true }
      } else cell += c
    } else if (c === ',') pushCell()
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow() }
    else if (c === '"' && cell === "" && !closed) quoted = true
    else { if (closed || c === '"') throw new Error("CSVの引用符が不正です。"); cell += c }
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません。")
  if (cell || row.length || closed) pushRow()
  if (rows.length < 2) throw new Error("見出しと1行以上のデータが必要です。")
  return rows
}
const aliases = {
  url: ["page", "pages", "top pages", "ページ", "上位のページ", "上位のページ数"],
  clicks: ["clicks", "クリック数"], impressions: ["impressions", "表示回数", "インプレッション数"],
  position: ["position", "average position", "掲載順位", "平均掲載順位"],
  ctr: ["ctr", "クリック率"],
}
function number(value: string, line: number): number {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) throw new Error(`${line}行目: 数値が空欄または不正です。`)
  const n = Number(value.replaceAll(",", ""))
  if (!Number.isFinite(n)) throw new Error(`${line}行目: 数値が大きすぎます。`)
  return n
}
export function importPagesCsv(text: string): Metric[] {
  const [header, ...data] = parseCsv(text)
  const normalized = header!.map(s => s.toLowerCase())
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, values]) => {
    const matches = normalized.flatMap((h, i) => values.includes(h) ? [i] : [])
    if (matches.length > 1) throw new Error("同じ意味の列が複数あります。比較モードを解除したページ別CSVを使用してください。")
    return [key, matches[0] ?? -1]
  })) as Record<keyof typeof aliases, number>
  if ([indexes.url, indexes.clicks, indexes.impressions, indexes.position].some(i => i < 0)) throw new Error("ページ・クリック数・表示回数・掲載順位の列が必要です。Search Consoleの「ページ」CSVを期間ごとに書き出してください。")
  if (normalized.some(h => ["query", "queries", "top queries", "クエリ", "上位のクエリ"].includes(h))) throw new Error("この画面はページ別CSV専用です。クエリとの結合は行いません。")
  if (data.length > 10000) throw new Error("CSVは10,000行以下にしてください。")
  const seen = new Set<string>()
  return data.map((row, index) => {
    const line = index + 2
    if (row.length !== header!.length) throw new Error(`${line}行目: 列数が一致しません。`)
    const url = pageUrl(row[indexes.url]!)
    if (seen.has(url)) throw new Error(`${line}行目: URLが重複しています。集計済みのページ別CSVを使用してください。`)
    seen.add(url)
    const clicks = number(row[indexes.clicks]!, line), impressions = number(row[indexes.impressions]!, line)
    if (!Number.isSafeInteger(clicks) || !Number.isSafeInteger(impressions) || clicks > impressions) throw new Error(`${line}行目: クリック数・表示回数の整合性を確認してください。`)
    const rawPosition = row[indexes.position]!
    const missingPosition = ["", "-", "~", "0"].includes(rawPosition)
    const position = missingPosition ? null : number(rawPosition, line)
    if ((impressions > 0 && position === null) || (position !== null && position < 1) || (impressions === 0 && position !== null)) throw new Error(`${line}行目: 表示回数と掲載順位の整合性を確認してください。`)
    // CTR is recomputed from counts; exported rounded values are never averaged.
    if (indexes.ctr >= 0 && row[indexes.ctr] && !["-", "~"].includes(row[indexes.ctr]!)) {
      const value = row[indexes.ctr]!
      const ctr = number(value.replace(/%$/, ""), line)
      if (ctr > (value.endsWith("%") ? 100 : 1)) throw new Error(`${line}行目: CTRが範囲外です。`)
    }
    return { url, clicks, impressions, position }
  })
}
