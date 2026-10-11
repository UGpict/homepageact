import { NextResponse } from "next/server"
import { JsonRequestError, readJsonRequest } from "../../../src/http-json"
import { HarnessError } from "../../../src/errors"
import { harnessErrorToHuman } from "../../../src/application/errors"

export async function seoJsonCommand(request: Request, maxBytes: number, action: (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>) {
  try {
    const result = await action(await readJsonRequest(request, maxBytes))
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    let message = "入力内容と対象ページを確認してください。"
    if (error instanceof HarnessError) { const human = harnessErrorToHuman(error); message = `${human.message} ${human.next}` }
    else if (error instanceof Error && !["ZodError", "SyntaxError", "TypeError", "TimeoutError"].includes(error.name)) message = error.message
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof JsonRequestError ? error.status : 400, headers: { "Cache-Control": "no-store" } })
  }
}
