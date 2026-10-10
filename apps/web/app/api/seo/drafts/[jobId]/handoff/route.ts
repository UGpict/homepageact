import { NextResponse } from "next/server"
import { appContext } from "../../../../../../lib/server"
import { exportSeoDraftHandoff } from "../../../../../../../../src/application/seo-draft-review"
export const runtime = "nodejs"
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON形式で送信してください。" }, { status: 415 })
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "このアプリの画面から送信してください。" }, { status: 403 })
  try {
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: "確認内容を入力してください。" }, { status: 400 })
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { value, done } = await reader.read(); if (done) break
      size += value.length
      if (size > 16000) { await reader.cancel(); return NextResponse.json({ error: "確認メモが長すぎます。" }, { status: 413 }) }
      chunks.push(value)
    }
    const { jobId } = await params
    const handoff = exportSeoDraftHandoff(appContext(), jobId, JSON.parse(Buffer.concat(chunks).toString("utf8")))
    return NextResponse.json({ ok: true, handoff })
  } catch (error) {
    const message = error instanceof Error && !error.message.startsWith("[") ? error.message : "確認項目と理由を確認してください。"
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
