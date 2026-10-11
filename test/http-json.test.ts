import test from "node:test"
import assert from "node:assert/strict"
import { readJsonRequest, JsonRequestError } from "../src/http-json.ts"
const request = (body: string, headers: Record<string,string> = {}) => new Request("https://app.example/api",{method:"POST",headers:{"content-type":"application/json",...headers},body})
const status = (expected: number) => (error: unknown) => error instanceof JsonRequestError && error.status === expected
test("JSON command boundary enforces media type, origin, byte limit and valid UTF-8/JSON", async () => {
  assert.deepEqual(await readJsonRequest(request('{"note":"確認"}',{"content-type":"Application/JSON; charset=utf-8",origin:"https://app.example"}),100),{note:"確認"})
  await assert.rejects(readJsonRequest(request('{}',{"content-type":"application/json-invalid"}),100),status(415))
  await assert.rejects(readJsonRequest(request('{}',{origin:"https://other.example"}),100),status(403))
  await assert.rejects(readJsonRequest(request('{'),100),status(400))
  await assert.rejects(readJsonRequest(request('"確認"'),5),status(413))
  await assert.rejects(readJsonRequest(new Request("https://app.example",{method:"POST",headers:{"content-type":"application/json"},body:new Uint8Array([0xff])}),100),status(400))
})
test("streamed oversized input is cancelled before JSON parsing", async () => {
  let cancelled = false
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('123456')); }, cancel() { cancelled = true } })
  const req = new Request("https://app.example",{method:"POST",headers:{"content-type":"application/json"},body,duplex:"half"} as RequestInit)
  await assert.rejects(readJsonRequest(req,5),status(413)); assert.equal(cancelled,true)
})
