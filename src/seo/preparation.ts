import type { SeoTask, TaskPlan } from "./model.ts"

export const preparationRequirements = [
  ["goal", "増やしたい相談"], ["research", "直したい箇所"],
  ["query", "実際に確認した検索語"], ["querySource", "検索語を確認した場所・日付"],
  ["evidence", "説明を裏付ける資料"], ["limitations", "確認できた範囲・分からないこと"],
] as const
export function missingPreparation(plan: TaskPlan): string[] {
  return [
    ...preparationRequirements.filter(([key]) => !plan[key].trim()).map(([, label]) => label),
    ...(!plan.evidenceReady ? ["資料がそろったことの確認"] : []),
  ]
}
/** A request for help, never a completed brief or technical approval. */
export function preparationRequest(task: SeoTask, plan: TaskPlan): string {
  const missing = missingPreparation(plan)
  return `# ページ改善の相談メモ${task.demo ? "（練習用・架空データ）" : ""}

準備途中の相談です。制作指示・技術確認・公開承認ではありません。
対象ページ: ${task.page.title}
URL: ${task.page.url}
作業ID: ${task.id}

## 担当者に確認したいこと
${missing.length ? missing.map(label => `- ${label}`).join("\n") : "記入内容と資料に不足がないかを確認してください。"}

## 記入済みの内容
${preparationRequirements.map(([key,label]) => `### ${label}\n${plan[key].trim() || "未確認"}`).join("\n\n")}

### 追加実験の予定
${plan.experiment.trim() || "未記入"}

### 写真の準備
${plan.photos.trim() || "未記入"}

実際の検索語は検索データで確認してください。未確認の内容・実験結果・数値を推測で補わないでください。
`
}
