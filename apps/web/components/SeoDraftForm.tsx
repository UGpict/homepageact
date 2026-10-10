"use client"
import { useState, type FormEvent } from "react"
import Link from "next/link"
import SeoSourceImport from "./SeoSourceImport"
import { PublicAchievementSchema, type PublicAchievement } from "../../../src/schema"
import type { SeoTask } from "../../../src/seo/model"
import type { SeoMetadataDraft } from "../../../src/application/seo-draft"

export default function SeoDraftForm({ task }: { task: SeoTask }) {
  const [document, setDocument] = useState<PublicAchievement | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SeoMetadataDraft | null>(null)
  async function read(file?: File) {
    setDocument(null); setResult(null); setError("")
    if (!file) return
    try {
      if (file.size > 800000) throw new Error("元データは800KB以下にしてください。")
      const doc = PublicAchievementSchema.parse(JSON.parse(await file.text()))
      if (task.page.url !== `https://www.macsystems.co.jp/ts/achievement/${doc.generated.slug}/`) throw new Error("作業のURLとJSONのslugが一致しません。")
      setDocument(doc)
    } catch (e) { setError(e instanceof Error && !e.message.startsWith("[") ? e.message : "既存ハーネス形式の実績JSONを選んでください。HTMLやコラムは対象外です。") }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!document) return
    const data = new FormData(event.currentTarget)
    setBusy(true); setError(""); setResult(null)
    try {
      const proposal = Object.fromEntries(["title", "h1", "description"].map(field => [field, String(data.get(field) ?? "").trim()]).filter(([, value]) => value))
      const response = await fetch("/api/seo/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: task.page.url, document, proposal, instruction: data.get("instruction"), mode: data.get("mode"), publicSourceConfirmed: data.get("confirmed") === "on" }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error ?? "作成できませんでした。")
      setResult(body.draft)
    } catch (e) { setError(e instanceof Error ? e.message : "作成できませんでした。") } finally { setBusy(false) }
  }
  return <div className="seo-editor">
    <h3>タイトル・見出し・説明文の下書きを作る</h3>
    <p className="hint">対象ページの構造化JSONが必要です。元データと入力した指示・修正案をアプリのサーバーへ送信し、下書きとして保存します。検索CSVや作業メモ全体は送信しません。</p>
    <label>対象ページの公開用JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={e => { void read(e.target.files?.[0]) }} /></label>
    <SeoSourceImport url={task.page.url} document={document} />
    {error && <p className="error" role="alert">{error}</p>}
    {document && <form className="form" onSubmit={submit} key={document.generated.slug}>
      <fieldset disabled={busy}><legend>修正する文章</legend>
        <label>タイトル案<input name="title" type="text" maxLength={200} defaultValue={document.generated.title} /></label>
        <label>H1案<input name="h1" type="text" maxLength={200} defaultValue={document.generated.h1} /></label>
        <label>説明文案<textarea name="description" maxLength={500} defaultValue={document.generated.description} /></label>
        <label>作成指示（送信する内容を確認）<textarea name="instruction" maxLength={3000} required defaultValue={`対象クエリ：${task.plan.query}\n目的：${task.plan.goal}\nタイトル・H1・説明文だけを提案してください。事実や数値を補わず、本文・写真・表は変更しないでください。`} /></label>
        <label>作成方法<select name="mode" defaultValue="manual"><option value="manual">入力した修正案を下書きにする</option><option value="ai">設定済みの外部AIで文章案を作る</option></select></label>
        <p className="hint">外部AIを選ぶ場合、現在の生成文章と上の指示を設定済みAPIに送ります。API未設定の場合は作成できません。根拠・写真の事実データや作業メモはAIへの送信対象に含めません。</p>
        <label className="choice"><input type="checkbox" name="confirmed" required />JSONは公開用の情報で、写真・数値は自社検証に基づき、顧客の機密情報を含まないことを確認しました。</label>
        <button disabled={busy}>{busy ? "下書きを作成中…" : "修正案の下書きを作成"}</button>
      </fieldset>
    </form>}
    {result && <div className="stack" role="status">
      <h3>修正案を保存しました：{result.phaseLabel}</h3>
      <p>写真 {result.preserved.images}件・工程 {result.preserved.points}件・関連リンク {result.preserved.relatedLinks}件と事実データを保持しました。公開はまだ行っていません。</p>
      <button className="secondary" type="button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(result.document, null, 2)], { type: "application/json" }))
        const a = window.document.createElement("a"); a.href = url; a.download = `${result.document.generated.slug}-seo-draft.json`; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>修正案JSONを保存</button>
      {result.changes.map(change => <div key={change.field}><strong>{change.field}</strong><div className="seo-columns"><div><small>変更前</small><p className="preserve">{change.before}</p></div><div><small>変更案</small><p className="preserve">{change.after}</p></div></div></div>)}
      {result.review.length > 0 && <ul>{result.review.map(c => <li key={c.detail.id}>{c.headline}：{c.quotation}</li>)}</ul>}
      <p><Link href={`/seo/drafts/${result.jobId}`}>保存した下書きを開いて確認する</Link></p>
      <p className="hint">作業ID：{result.jobId}。再読み込み後も「保存したSEO下書き」から開けます。技術確認と公開承認は別途必要です。</p>
    </div>}
  </div>
}
