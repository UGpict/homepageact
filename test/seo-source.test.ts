import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { inspectPublicHtml, importSeoPublicSource, getSeoPublicSource, listSeoPublicSources } from "../src/application/seo-source.ts"
import { hashText } from "../src/review.ts"
const url = "https://www.macsystems.co.jp/ts/achievement/bga/"
const now = "2026-10-10T15:00:00.000Z"
const html = '\uFEFF<!doctype html><html lang="ja"><head><title>BGA &amp; 断面解析</title><meta name="DESCRIPTION" content="自社検証 &amp; 解析"><link rel="canonical" href="'+url+'"><meta name="robots" content="index,follow"></head><body><h1>BGA\n <span>取り外し</span></h1><h2>工程</h2><img src="/ts/images/bga.webp" alt="実験写真"><table><tr><td>42</td></tr></table><iframe src="https://example.invalid/video"></iframe><script>const unsafe="<h1>偽見出し</h1>";</script></body></html>'
function root() { return mkdtempSync(path.join(tmpdir(), "seo-source-")) }
function response(body: BodyInit = html, init: ResponseInit = {}) { return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" }, ...init }) }
test("HTML parsing decodes entities, counts source elements, excludes script text and keeps original hash", () => {
  const s = inspectPublicHtml(html, url, now)
  assert.equal(s.title, "BGA & 断面解析")
  assert.equal(s.description, "自社検証 & 解析")
  assert.deepEqual(s.h1, ["BGA 取り外し"])
  assert.deepEqual(s.canonical, [url])
  assert.deepEqual(s.robots, ["index,follow"])
  assert.deepEqual(s.headings, [{ level: 1, text: "BGA 取り外し" }, { level: 2, text: "工程" }])
  assert.deepEqual(s.images, [{ src: "/ts/images/bga.webp", alt: "実験写真" }])
  assert.equal(s.tables, 1); assert.equal(s.embeds, 1)
  assert.equal(s.htmlHash, hashText(html))
  assert.equal(inspectPublicHtml(html.replace("</body>", "<svg><title>図のタイトル</title></svg></body>"), url, now).title, s.title)
  assert.throws(() => inspectPublicHtml('<head><meta name="description" content="a"><meta name="description" content="b"></head>', url, now), /重複/)
})
test("public import saves original UTF-8 HTML including BOM and lists/reopens without external fetching", async () => {
  const dataRoot = root(); assert.deepEqual(listSeoPublicSources(dataRoot), { sources: [], unreadable: 0 })
  let calls = 0
  const s = await importSeoPublicSource(dataRoot, { url }, (async (target, init) => {
    calls++; assert.equal(target, url); assert.equal(init?.redirect, "error"); assert.ok(init?.signal); assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, undefined)
    return response()
  }) as typeof fetch, now)
  assert.equal(calls, 1)
  assert.equal(s.fetchedAt, now)
  const record = getSeoPublicSource(dataRoot, s.id)!
  assert.equal(record.html, html)
  assert.deepEqual(record.snapshot, s)
  assert.deepEqual(listSeoPublicSources(dataRoot), { sources: [s], unreadable: 0 })
  assert.equal(getSeoPublicSource(dataRoot, "../secret"), undefined)
  assert.equal(getSeoPublicSource(dataRoot, "source-0000000000000000"), undefined)
})
test("reject unsafe URLs and extra input before any fetch", async () => {
  let calls = 0; const fetcher = (async () => { calls++; return response() }) as typeof fetch
  for (const value of ['http://www.macsystems.co.jp/ts/', 'https://evil.example/ts/', 'https://www.macsystems.co.jp@evil.example/ts/', 'https://www.macsystems.co.jp/ts/?secret=1', 'https://www.macsystems.co.jp/ts/../private/', 'https://www.macsystems.co.jp/ts/%2e%2e/private/', 'https://www.macsystems.co.jp:443/ts/', 'https://www.macsystems.co.jp/ts/#x']) {
    await assert.rejects(() => importSeoPublicSource(root(), { url: value }, fetcher, now))
  }
  await assert.rejects(() => importSeoPublicSource(root(), { url, html: "injected" }, fetcher, now))
  assert.equal(calls, 0)
})
test("HTTP, content type, redirects, oversize streams, encoding and empty source failures save nothing", async () => {
  const dataRoot = root()
  const responses = [response("error", { status: 404 }), response("", { status: 302 }), new Response("{}", { headers: { "content-type": "application/json" } }), response(html, { headers: { "content-type": "text/html", "content-length": "2000001" } }), response("x".repeat(2_000_001)), response(new Uint8Array([0xff,0xfe,0x61])), response(" ")]
  for (const r of responses) await assert.rejects(() => importSeoPublicSource(dataRoot, { url }, (async () => r) as typeof fetch, now))
  const redirected = response(); Object.defineProperty(redirected, "url", { value: "https://other.example/" })
  await assert.rejects(() => importSeoPublicSource(dataRoot, { url }, (async () => redirected) as typeof fetch, now), /取得先/)
  assert.deepEqual(readdirSync(dataRoot), [])
})
test("corrupt snapshots don't hide valid records; edited HTML is rejected and extracted metadata is recomputed", async () => {
  const dataRoot = root()
  const a = await importSeoPublicSource(dataRoot, { url }, (async () => response()) as typeof fetch, now)
  const b = await importSeoPublicSource(dataRoot, { url }, (async () => response()) as typeof fetch, now)
  const file = path.join(dataRoot, "seo-sources", a.id + ".json")
  const record = JSON.parse(readFileSync(file, "utf8")); record.snapshot.title = "偽のキャッシュ"; writeFileSync(file, JSON.stringify(record))
  assert.equal(getSeoPublicSource(dataRoot, a.id)?.snapshot.title, "BGA & 断面解析")
  record.html += "変更"; writeFileSync(file, JSON.stringify(record))
  assert.throws(() => getSeoPublicSource(dataRoot, a.id), /変更/)
  assert.deepEqual(listSeoPublicSources(dataRoot).sources.map(s => s.id), [b.id])
  assert.equal(listSeoPublicSources(dataRoot).unreadable, 1)
})
