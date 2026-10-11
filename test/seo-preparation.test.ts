import test from "node:test"
import assert from "node:assert/strict"
import { blankPlan, addTask, updateTask, exportBrief } from "../src/seo/tasks.ts"
import { demoWorkspace } from "../src/seo/demo.ts"
import { missingPreparation, preparationRequest, preparationRequirements } from "../src/seo/preparation.ts"
const now = "2026-10-11T06:00:00.000Z"
function example() { const w=demoWorkspace(); return addTask(w,w.pages[0]!.url,now,"seo-test-guide") }
test("unknown answers remain incomplete, can be saved and cannot become a production brief", () => {
  const w=example(); const plan={...blankPlan(),goal:"断面の相談を増やしたい"}
  const saved=updateTask(w,"seo-test-guide",plan,"researching",now)
  assert.equal(saved.tasks[0]!.plan.query,"")
  assert.ok(missingPreparation(plan).includes("実際に確認した検索語"))
  assert.throws(()=>updateTask(w,"seo-test-guide",plan,"brief-ready",now))
  assert.throws(()=>exportBrief(saved.tasks[0]!))
  const request=preparationRequest(saved.tasks[0]!,plan)
  assert.match(request,/制作指示・技術確認・公開承認ではありません/)
  assert.match(request,/練習用・架空データ/)
  assert.match(request,/実際に確認した検索語\n未確認/)
  assert.match(request,/断面の相談を増やしたい/)
})
test("guided completion agrees with the stored task requirements", () => {
  const w=example(); const complete={...blankPlan(),goal:"相談",research:"説明を見直す",query:"確認した語",querySource:"検索記録と日付",evidence:"自社検証の記録",limitations:"今回の試料のみ",evidenceReady:true}
  assert.deepEqual(missingPreparation(complete),[])
  assert.equal(updateTask(w,"seo-test-guide",complete,"brief-ready",now).tasks[0]!.status,"brief-ready")
  for(const [key] of preparationRequirements){const partial={...complete,[key]:" "};assert.ok(missingPreparation(partial).length);assert.throws(()=>updateTask(w,"seo-test-guide",partial,"brief-ready",now))}
  assert.ok(missingPreparation({...complete,evidenceReady:false}).length)
})
