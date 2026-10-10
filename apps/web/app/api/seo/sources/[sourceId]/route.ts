import { appContext } from "../../../../../lib/server"
import { getSeoPublicSource } from "../../../../../../../src/application/seo-source"
export const runtime = "nodejs"
export async function GET(_: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const { sourceId } = await params
    const record = getSeoPublicSource(appContext().dataRoot, sourceId)
    if (!record) return new Response("保存したHTMLが見つかりません。", { status: 404 })
    return new Response(record.html, { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${sourceId}.html"`, "x-content-type-options": "nosniff", "cache-control": "no-store" } })
  } catch { return new Response("保存データを読み込めません。再取得してください。", { status: 409 }) }
}
