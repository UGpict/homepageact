import { NextResponse } from "next/server"
import { appContext } from "../../../../../../lib/server"
import { recheckSeoDraftSource } from "../../../../../../../../src/application/seo-draft-review"
export const runtime = "nodejs"
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON形式で送信してください。" }, { status: 415 })
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "このアプリの画面から送信してください。" }, { status: 403 })
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error("確認対象を指定してください。")
    let size = 0; const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read(); if (done) break
      size += value.length
      if (size > 1000) { await reader.cancel(); return NextResponse.json({ error: "確認データが長すぎます。" }, { status: 413 }) }
      chunks.push(value)
    }
    const { jobId } = await params
    const draft = await recheckSeoDraftSource(appContext(), jobId, JSON.parse(Buffer.concat(chunks).toString("utf8")))
    return NextResponse.json({ ok: true, draft })
  } catch (error) {
    const message = error instanceof Error && !error.message.startsWith("[") ? error.message : "確認対象を確認してください。"
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
