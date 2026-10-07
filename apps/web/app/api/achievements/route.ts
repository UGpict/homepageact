import { NextResponse } from "next/server"
import { appContext, createAchievementDraft } from "../../../lib/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          title: "送信形式を確認してください",
          message: "入力内容を受け取れませんでした。",
          next: "画面からもう一度、下書きを作成してください。",
        },
      },
      { status: 415 },
    )
  }
  const body: unknown = await request.json()
  const draft = await createAchievementDraft(appContext(), body)
  if (!draft.ok) return NextResponse.json(draft, { status: 400 })
  return NextResponse.json({ ok: true, jobId: draft.job.jobId })
}
