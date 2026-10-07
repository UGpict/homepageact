import { NextResponse } from "next/server"
import { appContext, readPublicImage } from "../../../../lib/server"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params
  const bytes = readPublicImage(appContext(), file)
  if (!bytes) return new NextResponse("画像が見つかりません。", { status: 404 })
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  })
}
