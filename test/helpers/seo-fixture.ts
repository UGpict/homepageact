import { mkdtempSync, readFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { mockAchievementProvider } from "../../src/application/provider.ts"
import { runAchievementJob } from "../../src/run-job.ts"
import { loadSitePack } from "../../src/sitepack.ts"
import { recheckSeoDraftSource, getSeoDraftReview } from "../../src/application/seo-draft-review.ts"
import { importSeoPublicSource } from "../../src/application/seo-source.ts"
const packRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export const now = "2026-10-10T15:00:00.000Z"
export const sourceHtml = "<!doctype html><html><head><title>公開原本</title></head><body><h1>BGA検証</h1></body></html>"
export const fetchHtml = (html = sourceHtml) => (async () => new Response(html, { headers: { "content-type": "text/html" } })) as typeof fetch
export async function checked(ctx: Awaited<ReturnType<typeof setup>>["ctx"], jobId: string) {
  return recheckSeoDraftSource(ctx, jobId, { revision: getSeoDraftReview(ctx, jobId)!.revision }, fetchHtml())
}
export async function setup() {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "seo-draft-"))
  const ctx = { packRoot, dataRoot, user: { id: "requester", displayName: "依頼者", roles: ["requester" as const] }, provider: mockAchievementProvider(), confidentialTerms: [], now }
  const created = await runAchievementJob({ root: path.join(dataRoot, "original"), pack: loadSitePack(packRoot), jobId: "source", now, today: "2026-10-10", requestedBy: "requester", facts: JSON.parse(readFileSync(path.join(packRoot, "fixtures/bga/facts.json"), "utf8")), generate: async () => JSON.parse(readFileSync(path.join(packRoot, "fixtures/bga/model-output.json"), "utf8")) })
  const snapshot = await importSeoPublicSource(dataRoot, { url: "https://www.macsystems.co.jp/ts/achievement/bga/" }, fetchHtml(), now)
  const input = { url: snapshot.url, sourceId: snapshot.id, document: created.doc, proposal: { title: created.doc.generated.title + "｜検討用" }, instruction: "タイトルだけを検討用に変更", mode: "manual", publicSourceConfirmed: true }
  return { ctx, input, created }
}
