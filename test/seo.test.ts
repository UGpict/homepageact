import test from "node:test"
import assert from "node:assert/strict"
import { analyze, candidates, ctr } from "../src/seo/analyze.ts"
import { importPagesCsv, parseCsv } from "../src/seo/csv.ts"
import { demoWorkspace } from "../src/seo/demo.ts"
import { attachComparison, ComparisonSchema, day, emptyWorkspace, pageUrl, WorkspaceSchema, SITE } from "../src/seo/model.ts"
const csv = (rows: string) => `Top pages,Clicks,Impressions,CTR,Position\n${rows}`
const url = SITE + "achievement/bga/"
test("Japanese and English exports: BOM, CRLF, quoted thousands and escaped quotes", () => {
  assert.deepEqual(importPagesCsv(`\uFEFF上位のページ,クリック数,表示回数,CTR,掲載順位\r\n${url},20,"1,000",2%,5.5\r\n`), [{ url, clicks: 20, impressions: 1000, position: 5.5 }])
  assert.equal(importPagesCsv(csv(`${url},1,100,1%,8`))[0]?.clicks, 1)
  assert.deepEqual(parseCsv('a,b\n"c,\"\"d\"\"","line\nnext"'), [["a", "b"], ['c,"d"', "line\nnext"]])
})
test("reject malformed CSV, wrong dimensions, duplicates and invalid metrics", () => {
  for (const text of [
    'a,b\n"oops,b', 'a,b\n"x"oops,b', 'a,b\nx"x,b',
    "Query,Clicks,Impressions,Position\nfoo,1,100,8",
    csv(`${url},1,100,1%,8\n${url},2,200,1%,8`),
    csv(`${url},2,1,1%,8`), csv(`${url},,100,1%,8`),
    csv(`${url},1.5,100,1%,8`), csv(`${url},1,100,1%,0`),
    csv(`${url},0,0,0%,8`), csv(`${url},1,100,1%,8,extra`),
    csv(`${url},1,100,101%,8`), csv(`${url},-1,100,1%,8`),
    csv(`${url},1,100,1%,Infinity`),
    `Page,Top pages,Clicks,Impressions,Position\n${url},${url},1,100,8`,
    `Page,Query,Clicks,Impressions,Position\n${url},test,1,100,8`,
    "a".repeat(2_000_001),
  ]) assert.throws(() => importPagesCsv(text), text.slice(0, 100))
})
test("zero impressions has unknown CTR/position; nonzero CTR recomputed from counts", () => {
  const row = importPagesCsv(csv(`${url},0,0,0%,0`))[0]!
  assert.equal(row.position, null); assert.equal(ctr(row), null)
  assert.equal(ctr(importPagesCsv(csv(`${url},1,3,33.3%,8`))[0]), 1 / 3)
})
test("scope and URL identity are strict, without unsafe canonical assumptions", () => {
  for (const input of ["javascript:alert(1)", "https://evil.example/ts/", "https://www.macsystems.co.jp/other/", SITE + "#a", "https://user@www.macsystems.co.jp/ts/", SITE + "../admin"]) assert.throws(() => pageUrl(input))
  assert.notEqual(pageUrl(url + "?x=1"), pageUrl(url))
  assert.notEqual(pageUrl(url.slice(0, -1)), pageUrl(url))
})
test("comparison rejects invalid, overlapping and unequal date periods", () => {
  const c = demoWorkspace().comparison!
  assert.equal(ComparisonSchema.safeParse(c).success, true)
  for (const current of [
    { ...c.current, start: "2026-02-30" },
    { ...c.current, start: "2026-09-02" },
    { ...c.current, start: "2026-08-01", end: "2026-08-28" },
    { ...c.current, start: "2026-09-30" },
  ]) assert.equal(ComparisonSchema.safeParse({ ...c, current }).success, false)
  assert.throws(() => day("2026-13-01"))
  assert.equal(ComparisonSchema.safeParse({ ...c, confirmed: false }).success, false)
})
test("missing rows remain unknown, low samples and recent edits never auto become candidates", () => {
  const w = demoWorkspace(), result = analyze(w)
  assert.equal(result[0]?.status, "candidate")
  assert.equal(result[1]?.status, "insufficient")
  assert.equal(result[2]?.status, "candidate")
  assert.equal(result[3]?.status, "observing")
  assert.equal(result[4]?.status, "insufficient")
  assert.equal(result[4]?.current, undefined)
  assert.equal(candidates(result).length, 2)
  w.pages[0]!.lastEdited = "2026-10-01"
  assert.equal(analyze(w)[0]?.status, "observing")
})
test("reasons distinguish rank drop, CTR drop and average-page opportunity", () => {
  const w = demoWorkspace()
  assert.match(analyze(w)[0]!.reason, /順位の悪化/)
  assert.match(analyze(w)[2]!.reason, /CTR/)
  w.comparison!.current.rows[0]!.clicks = 60
  assert.match(analyze(w)[0]!.reason, /個別クエリの順位は未確認/)
  w.comparison!.current.rows[0]!.position = 2
  assert.equal(analyze(w)[0]!.status, "stable")
})
test("business fit drives priority, unknown scores stay provisional and output is capped", () => {
  const w = demoWorkspace()
  w.pages[0]!.businessFit = null
  const list = candidates(analyze(w))
  assert.equal(list[0]?.page.url, w.pages[2]?.url)
  assert.equal(list[1]?.score, null)
  w.pages[0]!.businessFit = 0
  assert.equal(analyze(w)[0]?.status, "stable")
  const f = list[0]!
  assert.equal(candidates(Array.from({ length: 8 }, (_, i) => ({ ...f, page: { ...f.page, url: `${SITE}${i}/` } }))).length, 5)
})
test("atomic import adds new URLs without mutating ledger and validates backup versions", () => {
  const original = emptyWorkspace(), c = demoWorkspace().comparison!
  c.current.rows.push({ url: SITE + "new/", clicks: 1, impressions: 10, position: 8 })
  const next = attachComparison(original, c)
  assert.equal(original.comparison, null)
  assert.equal(original.pages.length, 26)
  assert.equal(next.pages.length, 27)
  assert.equal(next.demo, false)
  assert.equal(WorkspaceSchema.safeParse(JSON.parse(JSON.stringify(next))).success, true)
  assert.equal(WorkspaceSchema.safeParse({ ...next, version: 3 }).success, false)
  assert.equal(WorkspaceSchema.safeParse({ ...next, pages: [next.pages[0], next.pages[0]] }).success, false)
})

test("old backups migrate without losing page or comparison data", () => {
  const legacy = { ...emptyWorkspace(), version: 1 } as Record<string, unknown>
  delete legacy.tasks
  const migrated = WorkspaceSchema.parse(legacy)
  assert.equal(migrated.version, 2)
  assert.deepEqual(migrated.tasks, [])
  assert.deepEqual(migrated.pages, legacy.pages)
})
