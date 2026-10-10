import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createSeoMetadataDraft, seoMetadataGeneratorFromEnv } from "../src/application/seo-draft.ts"
import { mockAchievementProvider } from "../src/application/provider.ts"
import { runAchievementJob } from "../src/run-job.ts"
import { loadSitePack } from "../src/sitepack.ts"
const packRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const now = "2026-10-10T15:00:00.000Z"
async function setup() {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "seo-draft-"))
  const ctx = { packRoot, dataRoot, user: { id: "requester", displayName: "依頼者", roles: ["requester" as const] }, provider: mockAchievementProvider(), confidentialTerms: [], now }
  const created = await runAchievementJob({ root: path.join(dataRoot, "original"), pack: loadSitePack(packRoot), jobId: "source", now, today: "2026-10-10", requestedBy: "requester", facts: JSON.parse(readFileSync(path.join(packRoot, "fixtures/bga/facts.json"), "utf8")), generate: async () => JSON.parse(readFileSync(path.join(packRoot, "fixtures/bga/model-output.json"), "utf8")) })
  const input = { url: "https://www.macsystems.co.jp/ts/achievement/bga/", document: created.doc, proposal: { title: created.doc.generated.title + "｜検討用" }, instruction: "タイトルだけを検討用に変更", mode: "manual", publicSourceConfirmed: true }
  return { ctx, input, created }
}
test("metadata draft uses the harness, keeps all facts and content, and never edits its source", async () => {
  const { ctx, input, created } = await setup()
  const original = readFileSync(path.join(ctx.dataRoot, "original", created.relativePath), "utf8")
  const result = await createSeoMetadataDraft(ctx, input)
  const draft = JSON.parse(readFileSync(path.join(ctx.dataRoot, "seo-drafts", result.jobId, created.relativePath), "utf8"))
  assert.deepEqual(draft.facts, created.doc.facts)
  assert.deepEqual(draft.generated.points, created.doc.generated.points)
  assert.deepEqual(draft.generated.images, created.doc.generated.images)
  assert.deepEqual(draft.generated.relatedLinks, created.doc.generated.relatedLinks)
  assert.equal(result.changes.length, 1)
  assert.equal(result.changes[0]?.field, "title")
  assert.equal(readFileSync(path.join(ctx.dataRoot, "original", created.relativePath), "utf8"), original)
  assert.equal(existsSync(path.join(ctx.dataRoot, "seo-drafts", result.jobId, "summary.json")), true)
})
test("reject wrong URL, absent clearance, unsupported model edits and confidential input before generation", async () => {
  const { ctx, input } = await setup()
  let calls = 0
  const generate = async () => { calls++; return { title: "案" } }
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, url: input.url.replace("bga", "crimp") }, generate))
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, publicSourceConfirmed: false }, generate))
  await assert.rejects(() => createSeoMetadataDraft({ ...ctx, confidentialTerms: ["秘密の顧客"] }, { ...input, mode: "ai", instruction: "秘密の顧客向け" }, generate))
  assert.equal(calls, 0)
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, mode: "ai" }, async () => ({ points: [], title: "案" })))
  assert.equal(existsSync(path.join(ctx.dataRoot, "seo-drafts")) ? readdirSync(path.join(ctx.dataRoot, "seo-drafts")).length : 0, 0)
})
test("no-op and missing AI configuration fail with no saved draft; numeric proposal remains pending", async () => {
  const { ctx, input } = await setup()
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, proposal: { title: input.document.generated.title } }), /同じ/)
  assert.equal(existsSync(path.join(ctx.dataRoot, "seo-drafts")) ? readdirSync(path.join(ctx.dataRoot, "seo-drafts")).length : 0, 0)
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, mode: "ai" }), /設定されていません/)
  const result = await createSeoMetadataDraft(ctx, { ...input, proposal: { title: "研磨時間999秒" } })
  assert.ok(result.review.length > 0)
  assert.ok(result.review.every(c => c.detail.status === "pending"))
})
test("HTTP generation sends only text-edit payload, retains server credentials, and rejects API errors", async () => {
  let body = ""
  const generator = seoMetadataGeneratorFromEnv({ SITEBOT_PROVIDER: "http", SITEBOT_GENERATION_URL: "https://generator.example/test", SITEBOT_GENERATION_API_KEY: "test-key" }, (async (_, init) => {
    body = String(init?.body)
    assert.equal((init?.headers as Record<string,string>).authorization, "Bearer test-key")
    return new Response(JSON.stringify({ title: "案" }), { status: 200 })
  }) as typeof fetch)!
  const { ctx, input } = await setup()
  await createSeoMetadataDraft(ctx, { ...input, mode: "ai" }, generator)
  const payload = JSON.parse(body).payload
  assert.equal(payload.recipe, "text_edit")
  assert.equal(payload.facts, undefined)
  assert.equal(body.includes("test-key"), false)
  assert.equal(payload.current.slug, "bga")
  assert.equal(seoMetadataGeneratorFromEnv({}), undefined)
})
