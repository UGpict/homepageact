"use client"
import { useState } from "react"
import type { SeoTask, TaskPlan } from "../../../src/seo/model"
import { missingPreparation, preparationRequest } from "../../../src/seo/preparation"

const questions = ["どこを分かりやすくしたい？", "何と検索されている？", "説明の根拠はある？"]
export default function SeoPreparationGuide({ task, disabled, onSave, onCancel }: {
  task: SeoTask; disabled: boolean; onSave: (plan: TaskPlan, status: SeoTask["status"]) => void; onCancel: () => void;
}) {
  const [step, setStep] = useState(0)
  const [plan, setPlan] = useState<TaskPlan>({ ...task.plan })
  const missing = missingPreparation(plan)
  function field(name: keyof Omit<TaskPlan, "evidenceReady">, label: string, hint: string, maxLength: number) {
    return <label>{label}<span className="hint">{hint}</span><textarea name={name} maxLength={maxLength} value={plan[name]} onChange={e => setPlan({ ...plan, [name]: e.target.value })} /></label>
  }
  function downloadRequest() {
    const url = URL.createObjectURL(new Blob([preparationRequest(task, plan)], { type: "text/markdown;charset=utf-8" }))
    const a = document.createElement("a"); a.href = url; a.download = `${task.demo ? "demo-" : ""}${task.id}-help.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
  }
  return <form className="form seo-editor" onSubmit={e => { e.preventDefault(); onSave(plan,"researching") }}>
    <fieldset disabled={disabled}><legend>{task.page.title} の調査・準備</legend>
      <p>3つの質問に、分かる範囲で答えてください。分からない項目は空欄で進められます。お客様の秘密の資料や名前は入れないでください。</p>
      <nav className="actions" aria-label="準備の質問">{questions.map((label,i)=><button key={label} type="button" className="secondary" aria-pressed={step===i} onClick={()=>setStep(i)}>{i+1}. {label}</button>)}</nav>
      <section hidden={step!==0}><h3>1. どこを分かりやすくしたい？</h3>
        <p><a href={task.page.url} target="_blank" rel="noreferrer">対象のページを開く</a>。初めて見る人に伝わりにくいところを探します。</p>
        {field("goal","このページを見た人から、どんな相談がほしい？","例：試料の断面を観察できるか、相談してほしい。自分の仕事の言葉で書けば大丈夫です。",1000)}
        {field("research","何が分かりにくい？ 何を伝えたい？","例：どの材料に対応できるかが分かりにくい。残したい写真や説明も書いてください。",4000)}
      </section>
      <section hidden={step!==1}><h3>2. 何と検索されている？</h3>
        <p>検索語は、Googleなどに入力された言葉です。ここだけは実際の検索記録で確認します。思いついた言葉で埋めなくて大丈夫です。</p>
        {field("query","確認できた検索語","まだ調べていなければ空欄にしてください。",200)}
        {field("querySource","どこで・いつ確認した？","検索データを見た人に、対象のページ・集計期間・確認日を教えてもらいます。",1000)}
        <details><summary>担当者には何を聞けばいい？</summary><p>「このページが、どんな言葉で検索されているかを知りたいです。対象URLの検索語と、集計期間・確認日を教えてください」と、ページのURLを添えて伝えてください。</p></details>
      </section>
      <section hidden={step!==2}><h3>3. 説明の根拠はある？</h3>
        {field("evidence","説明が正しいと確かめられる資料は？","自社で行った実験の記録番号、写真の名前、確認できた結果などを書きます。資料そのものの添付は不要です。",4000)}
        {field("limitations","どこまで確認できた？ まだ分からないことは？","例：今回の試料では確認できたが、別の材料ではまだ試していない。実際に分かっている範囲を書きます。",2000)}
        <details><summary>これから実験や写真を追加する場合</summary>
          {field("experiment","追加で確かめること","試料・条件・比べ方など、決まっていることを書いてください。",2000)}
          {field("photos","用意する写真・図","何を見せる写真か、保存場所、撮影条件などを書いてください。",2000)}
        </details>
        <label className="choice"><input type="checkbox" name="evidenceReady" checked={plan.evidenceReady} onChange={e=>setPlan({...plan,evidenceReady:e.target.checked})} />必要な資料・写真がそろい、保存場所も確認しました。</label>
        <div className="status"><strong>{missing.length ? "まだ確認が必要なこと" : "記入項目がそろいました"}</strong>{missing.length ? <ul>{missing.map(label=><li key={label}>{label}</li>)}</ul> : <p>次は下書きの作成へ進めます。内容が正しいかを確認する作業は、その後に別の担当者が行います。</p>}</div>
        <button type="button" disabled={disabled || missing.length>0} onClick={()=>onSave(plan,"brief-ready")}>準備を完了して保存</button>
      </section>
      <div className="actions">{step>0 && <button type="button" className="secondary" onClick={()=>setStep(step-1)}>前の質問へ</button>}{step<2 && <><button type="button" onClick={()=>setStep(step+1)}>次の質問へ</button><button type="button" className="secondary" onClick={()=>setStep(step+1)}>分からないので後で確認する</button></>}</div>
      <p className="hint">途中で保存すると「調査中」になります。検索語や資料が未確認のまま、準備完了にはなりません。</p>
      <div className="actions"><button type="submit">途中まで保存</button><button type="button" className="secondary" onClick={downloadRequest}>担当者への相談メモを保存</button><button type="button" className="secondary" onClick={onCancel}>閉じる（保存しない）</button></div>
      <p className="hint">相談メモは今の入力内容と未確認の項目をファイルにします。担当者への送信は行いません。ブラウザーに作業を残すには「途中まで保存」も押してください。</p>
      <details><summary>作業を終了・見送りにする</summary><p>準備項目がそろった作業は「対応完了」にできます。これは公開されたことを意味しません。</p><div className="actions"><button type="button" className="secondary" disabled={disabled || missing.length>0} onClick={()=>onSave(plan,"done")}>対応完了にする</button><button type="button" className="secondary" onClick={()=>onSave(plan,"cancelled")}>今回は見送る</button></div></details>
    </fieldset>
  </form>
}
