import { NextResponse } from "next/server"
import { appContext } from "../../../../lib/server"
import { createSeoMetadataDraft, seoMetadataGeneratorFromEnv } from "../../../../../../src/application/seo-draft"
import { HarnessError } from "../../../../../../src/errors"
import { harnessErrorToHuman } from "../../../../../../src/application/errors"
export const runtime = "nodejs"
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON形式で送信してください。" }, { status: 415 })
  // Reject cross-origin browser submissions; authentication remains a separate deployment prerequisite.
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "このアプリの画面から送信してください。" }, { status: 403 })
  try {
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: "データを送信してください。" }, { status: 400 })
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 1_000_000) { await reader.cancel(); return NextResponse.json({ error: "データは1MB以下にしてください。" }, { status: 413 }) }
      chunks.push(value)
    }
    const text = Buffer.concat(chunks).toString("utf8")
    const result = await createSeoMetadataDraft(appContext(), JSON.parse(text), seoMetadataGeneratorFromEnv())
    return NextResponse.json({ ok: true, draft: result })
  } catch (error) {
    if (error instanceof HarnessError) { const human = harnessErrorToHuman(error); return NextResponse.json({ ok: false, error: `${human.message} ${human.next}` }, { status: 400 }) }
    const message = error instanceof Error && !error.message.startsWith("[") ? error.message : "入力の形式、URL、修正案を確認してください。"
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
