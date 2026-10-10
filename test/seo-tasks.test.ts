import test from "node:test"
import assert from "node:assert/strict"
import { analyze } from "../src/seo/analyze.ts"
import { demoWorkspace } from "../src/seo/demo.ts"
import { attachComparison, WorkspaceSchema } from "../src/seo/model.ts"
import { addTask, blankPlan, exportBrief, todayInJapan, updateTask, weekOf } from "../src/seo/tasks.ts"
const now = "2026-10-10T15:30:00.000Z"
function taskWorkspace() {
  const w = demoWorkspace()
  return addTask(w, analyze(w)[0]!.page.url, now, "seo-one")
}
test("task selection preserves snapshot and prevents duplicate active tasks", () => {
  const w = taskWorkspace()
  assert.equal(w.tasks[0]?.week, "2026-10-05")
  assert.throws(() => addTask(w, w.pages[0]!.url, now, "seo-two"), /登録済み/)
  w.comparison!.current.rows[0]!.clicks = 500
  assert.equal(w.tasks[0]?.snapshot.current.clicks, 20)
})
test("weekly limit is two tasks; cancelled work frees a slot and next week is independent", () => {
  let w = taskWorkspace()
  w = addTask(w, w.pages[2]!.url, now, "seo-two")
  w.pages[3]!.lastEdited = null
  assert.throws(() => addTask(w, w.pages[3]!.url, now, "seo-three"), /2件/)
  w = updateTask(w, "seo-two", blankPlan(), "cancelled", now)
  w = addTask(w, w.pages[3]!.url, now, "seo-three")
  assert.equal(w.tasks.length, 3)
  assert.throws(() => updateTask(w, "seo-two", blankPlan(), "researching", now))
  w = addTask(w, w.pages[2]!.url, "2026-10-12T00:00:00.000Z", "seo-four")
  assert.equal(w.tasks[3]?.week, "2026-10-12")
})
test("new CSV does not replace task evidence", () => {
  const w = taskWorkspace(), c = structuredClone(w.comparison!)
  c.current.rows[0]!.clicks = 10
  // Real imports intentionally require leaving demo first; use real workspace for this test.
  w.demo = false; w.tasks[0]!.demo = false
  const next = attachComparison(w, c)
  assert.equal(next.tasks[0]?.snapshot.current.clicks, 20)
  assert.equal(next.comparison?.current.rows[0]?.clicks, 10)
})
test("draft preparation requires substantiated query and evidence; unprepared work cannot be exported", () => {
  let w = taskWorkspace()
  assert.throws(() => updateTask(w, "seo-one", blankPlan(), "brief-ready", now))
  const plan = { ...blankPlan(), goal: "見積相談", query: "断面研磨", querySource: "GSC URL絞り込み・確認日", research: "既存説明を比較", evidence: "自社検証記録A", limitations: "この条件のみ", evidenceReady: true }
  w = updateTask(w, "seo-one", plan, "brief-ready", now)
  assert.match(exportBrief(w.tasks[0]!), /技術確認・依頼者確認・公開承認/)
  assert.match(exportBrief(w.tasks[0]!), /架空データ/)
  assert.throws(() => updateTask(w, "seo-one", { ...plan, evidenceReady: false }, "brief-ready", now))
  w = updateTask(w, "seo-one", { ...plan, evidenceReady: false }, "evidence-needed", now)
  assert.throws(() => exportBrief(w.tasks[0]!))
})
test("schema rejects fabricated task snapshots, mixed demo records and repeated IDs", () => {
  const w = taskWorkspace(), t = structuredClone(w.tasks[0]!)
  t.snapshot.current.url = w.pages[1]!.url
  assert.equal(WorkspaceSchema.safeParse({ ...w, tasks: [t] }).success, false)
  assert.equal(WorkspaceSchema.safeParse({ ...w, tasks: [w.tasks[0], w.tasks[0]] }).success, false)
  assert.equal(WorkspaceSchema.safeParse({ ...w, demo: false }).success, false)
})
test("JST dates around midnight and Monday boundary do not use the server timezone", () => {
  assert.equal(todayInJapan(new Date("2026-10-11T15:00:00Z")), "2026-10-12")
  assert.equal(weekOf("2026-10-11"), "2026-10-05")
  assert.equal(weekOf("2026-10-12"), "2026-10-12")
})
