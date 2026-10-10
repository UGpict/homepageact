"use client"
import { useState, type FormEvent } from "react"
import { exportBrief, taskStatuses, updateTask } from "../../../src/seo/tasks"
import type { SeoTask, TaskPlan, Workspace } from "../../../src/seo/model"

const fields: Array<[keyof Omit<TaskPlan, "evidenceReady">, string, string]> = [
  ["goal", "この改善で増やしたい相談", "例：SiCの断面作製条件についての見積相談"],
  ["query", "確認した対象クエリ", "ページの平均順位から推測せず、対象URLのクエリを確認する"],
  ["querySource", "クエリの確認元・確認日", "例：Search ConsoleでこのURLを絞り込み / 対象期間 / 確認日"],
  ["research", "調査結果・変更したい箇所", "検索意図、上位ページ、既存ページの不足、残すべき要素"],
  ["experiment", "追加の自社検証計画", "試料・条件・変える因子・比較条件・測定方法。不要な場合は理由"],
  ["photos", "写真・図の準備", "比較写真、スケール、撮影条件。顧客の画像は使用しない"],
  ["evidence", "主張の根拠・資料の参照先", "自社検証の記録ID、条件、観察結果、写真IDや公開出典。機密資料は入力しない"],
  ["limitations", "適用範囲・限界", "今回の条件で言えること、一般化できないこと、未確認のこと"],
]
const limits: Record<string, number> = { goal: 1000, query: 200, querySource: 1000, research: 4000, experiment: 2000, photos: 2000, evidence: 4000, limitations: 2000 }
function downloadBrief(task: SeoTask) {
  const url = URL.createObjectURL(new Blob([exportBrief(task)], { type: "text/markdown;charset=utf-8" }))
  const a = document.createElement("a"); a.href = url; a.download = `${task.demo ? "demo-" : ""}${task.id}-brief.md`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function SeoWorkItems({ workspace, disabled, onSave, onError }: {
  workspace: Workspace; disabled: boolean; onSave: (w: Workspace, notice: string) => void; onError: (e: unknown) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [showFinished, setShowFinished] = useState(false)
  const task = workspace.tasks.find(t => t.id === selected)
  const tasks = workspace.tasks.filter(t => showFinished || !["done", "cancelled"].includes(t.status)).slice().reverse()
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!task) return
    const data = new FormData(event.currentTarget)
    const plan = Object.fromEntries(fields.map(([name]) => [name, data.get(name)])) as Omit<TaskPlan, "evidenceReady">
    try {
      onSave(updateTask(workspace, task.id, { ...plan, evidenceReady: data.get("evidenceReady") === "on" }, data.get("status") as SeoTask["status"], new Date().toISOString()), "作業内容を保存しました。")
      setSelected(null)
    } catch (e) { onError(e) }
  }
  return <section className="panel" id="seo-work-items">
    <h2>3. 選んだ作業を進める</h2>
    <p className="hint">候補の「今週の作業に追加」から最大2件を選びます。検索データを入れ替えても、選定時の根拠と調査内容は残ります。</p>
    <label className="choice"><input type="checkbox" checked={showFinished} onChange={e => setShowFinished(e.target.checked)} />完了・見送りも表示する</label>
    {tasks.length === 0 && <p className="drop">選んだ作業はまだありません。上の改善候補から追加してください。</p>}
    <ul className="task-list">{tasks.map(t => <li className="seo-work-card" key={t.id}>
      <div className="actions"><strong>{t.page.title}</strong><span className="meta">{taskStatuses[t.status]} / {t.week}週 {t.demo ? "/ デモ" : ""}</span></div>
      <p>{t.snapshot.reason}</p><p><strong>最初の確認：</strong>{t.snapshot.next}</p>
      <details><summary>選んだ時点の検索根拠</summary><p>{t.snapshot.previousStart}〜{t.snapshot.previousEnd} → {t.snapshot.currentStart}〜{t.snapshot.currentEnd}<br />{t.snapshot.filters}</p><p>クリック {t.snapshot.previous.clicks} → {t.snapshot.current.clicks} / 表示回数 {t.snapshot.previous.impressions} → {t.snapshot.current.impressions} / 平均順位 {t.snapshot.previous.position ?? "不明"} → {t.snapshot.current.position ?? "不明"}</p><a href={t.page.url} target="_blank" rel="noreferrer">対象ページを見る</a></details>
      <div className="actions"><button className="secondary" disabled={disabled} onClick={() => setSelected(t.id)}>調査・準備を記入</button><button className="secondary" disabled={disabled || !["brief-ready", "done"].includes(t.status)} onClick={() => { try { downloadBrief(t) } catch (e) { onError(e) } }}>制作指示を保存</button></div>
    </li>)}</ul>
    {task && <form className="form seo-editor" key={`${workspace.demo}-${task.id}-${task.updatedAt}`} onSubmit={save}>
      <fieldset disabled={disabled}><legend>{task.page.title} の調査・準備</legend>
        <p className="hint">入力は制作資料として扱います。公開用の写真・数値は自社検証に基づくものを使い、顧客名や機密情報は入力しないでください。</p>
        {fields.map(([name, label, hint]) => <label key={name}>{label}<textarea name={name} maxLength={limits[name]} defaultValue={task.plan[name]} placeholder={hint} /></label>)}
        <label className="choice"><input type="checkbox" name="evidenceReady" defaultChecked={task.plan.evidenceReady} />必要な根拠・写真・検証記録が揃い、参照先を記入しました。</label>
        <label>作業の状態<select name="status" defaultValue={task.status}>{Object.entries(taskStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="hint">「下書き準備完了」には目的・クエリと確認元・調査結果・根拠・適用範囲の記入が必要です。技術確認や公開承認は、下書き作成後に既存の手順で行います。</p>
        <div className="actions"><button>作業を保存</button><button type="button" className="secondary" onClick={() => setSelected(null)}>キャンセル</button></div>
      </fieldset>
    </form>}
  </section>
}
