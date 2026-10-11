"use client"
import { useState } from "react"
import SeoPreparationGuide from "./SeoPreparationGuide"
import SeoDraftForm from "./SeoDraftForm"
import { exportBrief, taskStatuses, updateTask } from "../../../src/seo/tasks"
import type { SeoTask, TaskPlan, Workspace } from "../../../src/seo/model"

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
  function save(plan: TaskPlan, status: SeoTask["status"]) {
    if (!task) return
    try {
      onSave(updateTask(workspace, task.id, plan, status, new Date().toISOString()), status === "brief-ready" ? "準備がそろいました。制作指示の保存や下書き作成へ進めます。" : "作業内容を保存しました。")
      setSelected(null)
    } catch (e) { onError(e) }
  }
  return <section className="panel" id="seo-work-items">
    <h2>3. 選んだ作業を進める</h2>
    <p className="hint">候補の「今週の作業に追加」から最大2件を選びます。検索データを入れ替えても、選定時の根拠と調査内容は残ります。</p>
    <label className="choice"><input type="checkbox" checked={showFinished} onChange={e => setShowFinished(e.target.checked)} />完了・見送りも表示する</label>
    {tasks.length === 0 && <p className="drop">選んだ作業はまだありません。「2. ページを選ぶ」から1件追加してください。</p>}
    <ul className="task-list">{tasks.map(t => <li className="seo-work-card" key={t.id}>
      <div className="actions"><strong>{t.page.title}</strong><span className="meta">{taskStatuses[t.status]} / {t.week}週 {t.demo ? "/ デモ" : ""}</span></div>
      <p>{t.snapshot.reason}</p><p><strong>最初の確認：</strong>{t.snapshot.next}</p>
      <details><summary>選んだ時点の検索根拠</summary><p>{t.snapshot.previousStart}〜{t.snapshot.previousEnd} → {t.snapshot.currentStart}〜{t.snapshot.currentEnd}<br />{t.snapshot.filters}</p><p>クリック {t.snapshot.previous.clicks} → {t.snapshot.current.clicks} / 表示回数 {t.snapshot.previous.impressions} → {t.snapshot.current.impressions} / 平均順位 {t.snapshot.previous.position ?? "不明"} → {t.snapshot.current.position ?? "不明"}</p><a href={t.page.url} target="_blank" rel="noreferrer">対象ページを見る</a></details>
      <div className="actions"><button className="secondary" disabled={disabled} onClick={() => setSelected(t.id)}>調査・準備を記入</button><button className="secondary" disabled={disabled || !["brief-ready", "done"].includes(t.status)} onClick={() => { try { downloadBrief(t) } catch (e) { onError(e) } }}>制作指示を保存</button></div>
      {["brief-ready", "done"].includes(t.status) && !t.demo && t.page.kind === "achievement" && <details><summary>下書き作成に進む</summary><SeoDraftForm key={t.updatedAt} task={t} /></details>}
      {["brief-ready", "done"].includes(t.status) && (t.demo || t.page.kind !== "achievement") && <p className="hint">画面からの下書き作成は実績ページの実作業が対象です。デモや他の種類は制作指示を保存して進めてください。</p>}
    </li>)}</ul>
    {task && <SeoPreparationGuide key={`${workspace.demo}-${task.id}-${task.updatedAt}`} task={task} disabled={disabled} onSave={save} onCancel={()=>setSelected(null)} />}
  </section>
}
