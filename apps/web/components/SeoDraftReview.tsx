"use client"
import Link from "next/link"
import { useState, type FormEvent } from "react"
import type { SeoDraftReview as Draft } from "../../../src/application/seo-draft-review"
const labels = { title: "タイトル", h1: "H1", description: "説明文" }
export default function SeoDraftReview({ initial, reviewerLabel }: { initial: Draft; reviewerLabel: string }) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  async function record(event: FormEvent<HTMLFormElement>, claimId: string) {
    event.preventDefault()
    const form = event.currentTarget; const data = new FormData(form)
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/seo/drafts/${draft.jobId}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: draft.revision, claimId, decision: data.get("decision"), note: data.get("note") }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error ?? "記録できませんでした。")
      setDraft(body.draft); form.reset(); setNotice("技術確認の結果を記録しました。公開はまだ行っていません。")
    } catch (e) { setError(e instanceof Error ? e.message : "記録できませんでした。") } finally { setBusy(false) }
  }
  return <div className="stack seo-dashboard">
    <p className="back"><Link href="/seo/drafts">← 下書き一覧に戻る</Link></p>
    <section className="panel"><h1>SEO下書きの確認</h1>
      <p className="status"><strong>{draft.phaseLabel}</strong> / {draft.pendingCount}件確認待ち</p>
      <p><a href={draft.sourceUrl} target="_blank" rel="noreferrer">対象の公開ページを見る</a></p>
      <p className="meta">作業ID {draft.jobId} / 依頼者 {draft.requestedBy} / 作成日時 {draft.createdAt}</p>
      <p>写真 {draft.preserved.images}件・工程 {draft.preserved.points}件・関連リンク {draft.preserved.relatedLinks}件と事実データを保持しています。技術確認が終わっても、依頼者の確認と公開承認は別途必要です。</p>
      <button className="secondary" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(draft.document, null, 2)], { type: "application/json" }))
        const a = document.createElement("a"); a.href = url; a.download = `${draft.document.generated.slug}-seo-draft.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>修正案JSONを保存</button><p className="hint">ダウンロードしたJSONは下書きのままです。確認記録はサーバーに保存され、JSONに公開承認を付けることはありません。</p>
    </section>
    <section className="panel"><h2>変更差分</h2>{draft.changes.map(c => <div key={c.field}><h3>{labels[c.field]}</h3><div className="seo-columns"><div><small>変更前</small><p className="preserve">{c.before}</p></div><div><small>変更案</small><p className="preserve">{c.after}</p></div></div></div>)}</section>
    <section className="panel"><h2>技術確認</h2>
      <p>現在の利用者：{reviewerLabel}</p>
      {!draft.canReview && <p className="hint">この利用者は確認結果を記録できません。依頼者とは別の技術確認担当者で開いてください。</p>}
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
      <ul className="claim-list">{draft.review.map(c => <li key={c.detail.id}><h3>{c.headline}</h3><p>{c.quotation}</p><p><strong>{c.statusLabel}</strong> / {c.locationLabel} / {c.kindLabel}</p>
        {draft.canReview && <form className="form" onSubmit={e => { void record(e, c.detail.id) }}><fieldset disabled={busy}><legend>確認結果を記録</legend>
          <label>判断<select name="decision" defaultValue="needs_changes"><option value="needs_changes">要修正・確認待ちに戻す</option><option value="confirmed">根拠を確認済み</option></select></label>
          <label>確認根拠・修正が必要な理由<textarea name="note" required maxLength={1000} placeholder="確認した自社検証データや対象箇所を記入。顧客名・機密情報は含めないでください。" /></label>
          <button>{busy ? "記録しています…" : "確認結果を記録"}</button>
        </fieldset></form>}
      </li>)}</ul>
    </section>
    <section className="panel"><h2>確認履歴</h2>{!draft.history.length ? <p>まだ記録はありません。</p> : <ol>{draft.history.map((h, i) => <li key={i}><strong>{h.decision === "confirmed" ? "確認済み" : "要修正"}</strong><p className="preserve">{h.note}</p><p className="meta">{h.reviewer} / {h.at} / {h.claimId}</p></li>)}</ol>}</section>
  </div>
}
