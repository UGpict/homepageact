import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createSeoMetadataDraft, seoMetadataGeneratorFromEnv } from "../src/application/seo-draft.ts"
import { mockAchievementProvider } from "../src/application/provider.ts"
import { runAchievementJob } from "../src/run-job.ts"
import { loadSitePack } from "../src/sitepack.ts"
import { getSeoDraftReview, listSeoDrafts, recordSeoDraftReview, recheckSeoDraftSource } from "../src/application/seo-draft-review.ts"
import { importSeoPublicSource } from "../src/application/seo-source.ts"
import { currentUserFromEnv } from "../src/application/user.ts"
const packRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const now = "2026-10-10T15:00:00.000Z"
const sourceHtml = "<!doctype html><html><head><title>公開原本</title></head><body><h1>BGA検証</h1></body></html>"
const fetchHtml = (html = sourceHtml) => (async () => new Response(html, { headers: { "content-type": "text/html" } })) as typeof fetch
async function checked(ctx: Awaited<ReturnType<typeof setup>>["ctx"], jobId: string) {
  return recheckSeoDraftSource(ctx, jobId, { revision: getSeoDraftReview(ctx, jobId)!.revision }, fetchHtml())
}
async function setup() {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "seo-draft-"))
  const ctx = { packRoot, dataRoot, user: { id: "requester", displayName: "依頼者", roles: ["requester" as const] }, provider: mockAchievementProvider(), confidentialTerms: [], now }
  const created = await runAchievementJob({ root: path.join(dataRoot, "original"), pack: loadSitePack(packRoot), jobId: "source", now, today: "2026-10-10", requestedBy: "requester", facts: JSON.parse(readFileSync(path.join(packRoot, "fixtures/bga/facts.json"), "utf8")), generate: async () => JSON.parse(readFileSync(path.join(packRoot, "fixtures/bga/model-output.json"), "utf8")) })
  const snapshot = await importSeoPublicSource(dataRoot, { url: "https://www.macsystems.co.jp/ts/achievement/bga/" }, fetchHtml(), now)
  const input = { url: snapshot.url, sourceId: snapshot.id, document: created.doc, proposal: { title: created.doc.generated.title + "｜検討用" }, instruction: "タイトルだけを検討用に変更", mode: "manual", publicSourceConfirmed: true }
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

test("saved drafts reopen from canonical content, not cached review status, and list empty stores", async () => {
  const { ctx, input } = await setup()
  assert.deepEqual(listSeoDrafts(ctx), { drafts: [], unreadable: 0 })
  const draft = await createSeoMetadataDraft(ctx, input)
  const summaryPath = path.join(ctx.dataRoot, "seo-drafts", draft.jobId, "summary.json")
  writeFileSync(summaryPath, JSON.stringify({ ...draft, review: [], phaseLabel: "公開準備完了" }))
  const reopened = getSeoDraftReview(ctx, draft.jobId)!
  assert.equal(reopened.phaseLabel, "公開ページの再確認待ち")
  assert.equal(reopened.canReview, false)
  assert.equal(reopened.createdAt, now)
  assert.deepEqual(reopened.document, draft.document)
  assert.equal(listSeoDrafts(ctx).drafts[0]?.jobId, draft.jobId)
  assert.equal(getSeoDraftReview(ctx, "../../original"), undefined)
  assert.equal(getSeoDraftReview(ctx, "job-00000000"), undefined)
})
test("technical review persists decisions and reasons, keeps document unchanged, and supports correction", async () => {
  const { ctx, input } = await setup()
  const draft = await createSeoMetadataDraft(ctx, input)
  await checked(ctx, draft.jobId)
  const reviewer = { ...ctx, user: { id: "engineer", displayName: "技術担当", roles: ["technical-reviewer" as const] } }
  const opened = getSeoDraftReview(reviewer, draft.jobId)!
  assert.equal(opened.canReview, true)
  const claimId = opened.review[0]!.detail.id
  const approved = recordSeoDraftReview(reviewer, draft.jobId, { revision: opened.revision, claimId, decision: "confirmed", note: "自社検証データと公開ページを照合" })
  assert.equal(approved.review[0]?.detail.status, "ok")
  assert.equal(approved.history[0]?.reviewer, "engineer")
  assert.notEqual(approved.revision, opened.revision)
  assert.deepEqual(approved.document, draft.document)
  assert.equal(approved.document.meta.status, "draft")
  assert.notEqual(approved.phaseLabel, "公開準備完了")
  assert.deepEqual(getSeoDraftReview(reviewer, draft.jobId), approved)
  const reverted = recordSeoDraftReview(reviewer, draft.jobId, { revision: approved.revision, claimId, decision: "needs_changes", note: "説明文の条件表記を修正する必要あり" })
  assert.equal(reverted.review[0]?.detail.status, "pending")
  assert.equal(reverted.history.length, 2)
  assert.equal(listSeoDrafts(ctx).drafts[0]?.pendingCount, reverted.pendingCount)
  let complete = reverted
  for (const claim of complete.review) {
    complete = recordSeoDraftReview(reviewer, draft.jobId, { revision: complete.revision, claimId: claim.detail.id, decision: "confirmed", note: "全項目を自社検証データで照合" })
  }
  assert.equal(complete.pendingCount, 0)
  assert.equal(complete.phaseLabel, "内容の確認")
  assert.equal(complete.document.meta.status, "draft")
})
test("review rejects self-approval, wrong role, stale revisions, unknown claims and confidential reasons", async () => {
  const { ctx, input } = await setup()
  const draft = await createSeoMetadataDraft(ctx, input)
  await checked(ctx, draft.jobId)
  const opened = getSeoDraftReview(ctx, draft.jobId)!
  const request = { revision: opened.revision, claimId: opened.review[0]!.detail.id, decision: "confirmed", note: "検証済み" }
  assert.throws(() => recordSeoDraftReview(ctx, draft.jobId, request), /別の技術/)
  assert.throws(() => recordSeoDraftReview({ ...ctx, user: { ...ctx.user, roles: ["technical-reviewer"] } }, draft.jobId, request), /別の技術/)
  const reviewer = { ...ctx, user: { id: "engineer", displayName: "技術担当", roles: ["technical-reviewer" as const] } }
  assert.throws(() => recordSeoDraftReview(reviewer, draft.jobId, { ...request, claimId: "unknown" }), /項目/)
  assert.throws(() => recordSeoDraftReview(reviewer, draft.jobId, { ...request, note: " " }))
  assert.throws(() => recordSeoDraftReview(reviewer, draft.jobId, { ...request, reviewer: "spoofed" }))
  assert.throws(() => recordSeoDraftReview({ ...reviewer, confidentialTerms: ["秘密顧客"] }, draft.jobId, { ...request, note: "秘密顧客の検証" }), /機密/)
  recordSeoDraftReview(reviewer, draft.jobId, request)
  assert.throws(() => recordSeoDraftReview(reviewer, draft.jobId, request), /更新されています/)
  assert.equal(getSeoDraftReview(reviewer, draft.jobId)?.history.length, 1)
})
test("changed source invalidates review; broken drafts are reported and don't hide valid drafts", async () => {
  const { ctx, input } = await setup()
  const draft = await createSeoMetadataDraft(ctx, input)
  await checked(ctx, draft.jobId)
  const sourcePath = path.join(ctx.dataRoot, "seo-drafts", draft.jobId, "source.json")
  const reviewer = { ...ctx, user: { id: "engineer", displayName: "技術担当", roles: ["technical-reviewer" as const] } }
  const opened = getSeoDraftReview(reviewer, draft.jobId)!
  recordSeoDraftReview(reviewer, draft.jobId, { revision: opened.revision, claimId: opened.review[0]!.detail.id, decision: "confirmed", note: "検証済み" })
  writeFileSync(sourcePath, JSON.stringify({ ...input.document, generated: { ...input.document.generated, title: "変更された元タイトル" } }))
  assert.throws(() => getSeoDraftReview(ctx, draft.jobId), /変更されています/)
  const valid = await createSeoMetadataDraft(ctx, input)
  assert.deepEqual(listSeoDrafts(ctx).drafts.map(d => d.jobId), [valid.jobId])
  assert.equal(listSeoDrafts(ctx).unreadable, 1)
  writeFileSync(sourcePath, "broken JSON")
  assert.equal(listSeoDrafts(ctx).unreadable, 1)
})
test("draft reopening refuses changes to preserved facts and generated body", async () => {
  const { ctx, input, created } = await setup()
  const draft = await createSeoMetadataDraft(ctx, input)
  const target = path.join(ctx.dataRoot, "seo-drafts", draft.jobId, created.relativePath)
  writeFileSync(target, JSON.stringify({ ...draft.document, generated: { ...draft.document.generated, points: [] } }))
  assert.throws(() => getSeoDraftReview(ctx, draft.jobId), /事実データ/)
})
test("development reviewer role comes only from server environment and defaults to requester", () => {
  assert.deepEqual(currentUserFromEnv({}).roles, ["requester"])
  assert.deepEqual(currentUserFromEnv({ SITEBOT_DEV_USER_ROLE: "technical-reviewer" }).roles, ["technical-reviewer"])
  assert.deepEqual(currentUserFromEnv({ SITEBOT_DEV_USER_ROLE: "site-admin" }).roles, ["requester"])
})

test("creation binds the saved HTML, rejects missing/wrong/stale sources before AI, and doesn't depend on the shared baseline file", async () => {
  const { ctx, input } = await setup()
  let calls = 0; const generate = async () => { calls++; return { title: "案" } }
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, sourceId: undefined, mode: "ai" }, generate))
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, sourceId: "source-0000000000000000", mode: "ai" }, generate))
  const other = await importSeoPublicSource(ctx.dataRoot, { url: input.url.replace("bga", "other") }, fetchHtml(), now)
  await assert.rejects(() => createSeoMetadataDraft(ctx, { ...input, sourceId: other.id, mode: "ai" }, generate), /対象ページ/)
  await assert.rejects(() => createSeoMetadataDraft({ ...ctx, now: "2026-10-10T15:31:00.000Z" }, { ...input, mode: "ai" }, generate), /30分/)
  assert.equal(calls, 0)
  const draft = await createSeoMetadataDraft(ctx, input)
  rmSync(path.join(ctx.dataRoot, "seo-sources", input.sourceId + ".json"))
  assert.equal(JSON.parse(readFileSync(path.join(ctx.dataRoot, "seo-drafts", draft.jobId, "origin.json"), "utf8")).html, sourceHtml)
  assert.equal(getSeoDraftReview(ctx, draft.jobId)?.origin.baseline?.title, "公開原本")
})
test("changed public HTML suspends previous confirmations permanently for this draft, even if the site is restored", async () => {
  const { ctx, input } = await setup(); const draft = await createSeoMetadataDraft(ctx, input)
  let opened = await checked(ctx, draft.jobId)
  const reviewer = { ...ctx, user: { id: "engineer", displayName: "技術担当", roles: ["technical-reviewer" as const] } }
  for (const claim of opened.review) opened = recordSeoDraftReview(reviewer, draft.jobId, { revision: opened.revision, claimId: claim.detail.id, decision: "confirmed", note: "照合済み" })
  assert.equal(opened.pendingCount, 0)
  const changed = await recheckSeoDraftSource(reviewer, draft.jobId, { revision: opened.revision }, fetchHtml(sourceHtml + "<!--changed footer-->"))
  assert.equal(changed.origin.status, "changed"); assert.equal(changed.canReview, false)
  assert.ok(changed.pendingCount > 0); assert.ok(changed.history.length > 0)
  assert.ok(changed.review.every(c => c.detail.status === "pending"))
  assert.throws(() => recordSeoDraftReview(reviewer, draft.jobId, { revision: changed.revision, claimId: changed.review[0]!.detail.id, decision: "confirmed", note: "再確認" }), /作り直して/)
  const restored = await recheckSeoDraftSource(reviewer, draft.jobId, { revision: changed.revision }, fetchHtml())
  assert.equal(restored.origin.status, "changed"); assert.equal(restored.canReview, false)
  assert.deepEqual(restored.document, draft.document)
})
test("unlinked, unchecked, expired and failed source checks cannot confirm claims; failure can recover with an identical fetch", async () => {
  const { ctx, input } = await setup(); const draft = await createSeoMetadataDraft(ctx, input)
  const reviewer = { ...ctx, user: { id: "engineer", displayName: "技術担当", roles: ["technical-reviewer" as const] } }
  assert.equal(getSeoDraftReview(reviewer, draft.jobId)?.canReview, false)
  const opened = await checked(ctx, draft.jobId)
  const request = { revision: opened.revision, claimId: opened.review[0]!.detail.id, decision: "confirmed", note: "確認" }
  const later = { ...reviewer, now: "2026-10-10T15:31:00.000Z" }
  assert.equal(getSeoDraftReview(later, draft.jobId)?.origin.status, "expired")
  assert.throws(() => recordSeoDraftReview(later, draft.jobId, request), /再確認/)
  const failed = await recheckSeoDraftSource(reviewer, draft.jobId, { revision: opened.revision }, (async () => { throw new Error("private network error") }) as typeof fetch)
  assert.equal(failed.origin.status, "failed"); assert.equal(failed.canReview, false)
  const recovered = await recheckSeoDraftSource(reviewer, draft.jobId, { revision: failed.revision }, fetchHtml())
  assert.equal(recovered.origin.status, "unchanged"); assert.equal(recovered.canReview, true)
  const old = await createSeoMetadataDraft(ctx, input)
  rmSync(path.join(ctx.dataRoot, "seo-drafts", old.jobId, "origin.json"))
  assert.equal(getSeoDraftReview(reviewer, old.jobId)?.origin.status, "unlinked")
  assert.equal(getSeoDraftReview(reviewer, old.jobId)?.canReview, false)
  await assert.rejects(() => recheckSeoDraftSource(reviewer, old.jobId, { revision: getSeoDraftReview(reviewer, old.jobId)!.revision }, fetchHtml()), /未紐付け/)
})
test("an in-flight recheck cannot overwrite a concurrent technical decision", async () => {
  const { ctx, input } = await setup(); const draft = await createSeoMetadataDraft(ctx, input)
  const opened = await checked(ctx, draft.jobId)
  const reviewer = { ...ctx, user: { id: "engineer", displayName: "技術担当", roles: ["technical-reviewer" as const] } }
  let resolveFetch!: (response: Response) => void
  const deferred = new Promise<Response>(resolve => { resolveFetch = resolve })
  const inFlight = recheckSeoDraftSource(reviewer, draft.jobId, { revision: opened.revision }, (async () => deferred) as typeof fetch)
  recordSeoDraftReview(reviewer, draft.jobId, { revision: opened.revision, claimId: opened.review[0]!.detail.id, decision: "confirmed", note: "照合済み" })
  resolveFetch(new Response(sourceHtml, { headers: { "content-type": "text/html" } }))
  await inFlight
  assert.equal(getSeoDraftReview(reviewer, draft.jobId)?.history.length, 1)
  assert.equal(getSeoDraftReview(reviewer, draft.jobId)?.origin.status, "unchanged")
  const latest = getSeoDraftReview(reviewer, draft.jobId)!
  const driftFetch = new Promise<Response>(resolve => { resolveFetch = resolve })
  const driftCheck = recheckSeoDraftSource(reviewer, draft.jobId, { revision: latest.revision }, (async () => driftFetch) as typeof fetch)
  recordSeoDraftReview(reviewer, draft.jobId, { revision: latest.revision, claimId: latest.review[0]!.detail.id, decision: "confirmed", note: "再照合済み" })
  resolveFetch(new Response(sourceHtml + "<!--changed-->", { headers: { "content-type": "text/html" } }))
  const changed = await driftCheck
  assert.equal(changed.history.length, 2)
  assert.equal(changed.origin.status, "changed")
  assert.equal(changed.canReview, false)
})

test("parallel source checks never replace detected drift with an older matching result", async () => {
  for (const firstChanges of [false, true]) {
    const { ctx, input } = await setup(); const draft = await createSeoMetadataDraft(ctx, input)
    const opened = await checked(ctx, draft.jobId)
    let resolveFetch!: (response: Response) => void
    const deferred = new Promise<Response>(resolve => { resolveFetch = resolve })
    const first = recheckSeoDraftSource(ctx, draft.jobId, { revision: opened.revision }, (async () => deferred) as typeof fetch)
    await recheckSeoDraftSource(ctx, draft.jobId, { revision: opened.revision }, fetchHtml(firstChanges ? sourceHtml : sourceHtml + "<!--new change-->"))
    resolveFetch(new Response(firstChanges ? sourceHtml + "<!--older change-->" : sourceHtml, { headers: { "content-type": "text/html" } }))
    if (firstChanges) await first
    else await assert.rejects(() => first, /別の原本確認/)
    assert.equal(getSeoDraftReview(ctx, draft.jobId)?.origin.status, "changed")
    assert.equal(getSeoDraftReview(ctx, draft.jobId)?.canReview, false)
  }
})
