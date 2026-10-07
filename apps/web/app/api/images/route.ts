import { NextResponse } from "next/server"
import { appContext, prepareAchievementImage } from "../../../lib/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const form = await request.formData()
  const keys = [...form.keys()]
  if (keys.some((key) => key !== "file")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          title: "送信できない項目が含まれています",
          message: "画像以外の指定は受け取れません。",
          next: "画像ファイルだけを選んで、もう一度アップロードしてください。",
        },
      },
      { status: 400 },
    )
  }
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          title: "画像を選んでください",
          message: "アップロードされたファイルが見つかりません。",
          next: "画像を選び直してください。",
        },
      },
      { status: 400 },
    )
  }
  const saved = await prepareAchievementImage(appContext(), {
    bytes: Buffer.from(await file.arrayBuffer()),
    sourceName: file.name,
  })
  if (!saved.ok) return NextResponse.json(saved, { status: 400 })
  return NextResponse.json({ ok: true, upload: saved.upload })
}
