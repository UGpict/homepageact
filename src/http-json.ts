/** Common bounded JSON boundary for same-origin browser commands; not authentication. */
export class JsonRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
export async function readJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType !== "application/json") throw new JsonRequestError(415, "JSON形式で送信してください。")
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) throw new JsonRequestError(403, "このアプリの画面から送信してください。")
  const reader = request.body?.getReader()
  if (!reader) throw new JsonRequestError(400, "データを送信してください。")
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel()
        throw new JsonRequestError(413, "送信データが大きすぎます。")
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) }
  catch { throw new JsonRequestError(400, "JSONの内容を確認してください。") }
}
