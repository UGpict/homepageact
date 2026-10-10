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
  async function handoff() {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/seo/drafts/${draft.jobId}/handoff`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: draft.revision }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error ?? "書き出せませんでした。")
      const url = URL.createObjectURL(new Blob([JSON.stringify(body.handoff, null, 2)], { type: "application/json" }))
      const a = document.createElement("a"); a.href = url; a.download = `${draft.document.generated.slug}-seo-handoff.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice("引き渡しデータを書き出しました。本番ファイルは変更していません。")
    } catch (e) { setError(e instanceof Error ? e.message : "書き出せませんでした。") } finally { setBusy(false) }
  }
  async function recheck() {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/seo/drafts/${draft.jobId}/source-check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: draft.revision }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error ?? "確認できませんでした。")
      setDraft(body.draft); setNotice("公開ページの再確認結果を保存しました。")
    } catch (e) { setError(e instanceof Error ? e.message : "確認できませんでした。") } finally { setBusy(false) }
  }
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
    <section className="panel"><h2>本番側への引き渡し</h2>
      <p>技術確認済みの修正案・元JSON・確認根拠をまとめて保存します。依頼者が書き出し、本番側で元データとの一致を検証してください。</p>
      <button disabled={busy || !draft.canHandoff} onClick={() => { void handoff() }}>確認済みの引き渡しデータを保存</button>
      <p className="hint">全項目の技術確認と30分以内の原本確認が必要です。このデータは公開承認ではありません。本番ソースがこのJSON形式に対応していない場合は個別の接続が必要です。</p>
    </section>
    <section className="panel"><h2>公開原本の変更確認</h2>
      <p className="hint">公開HTML全体の一致を確認します。技術確認の前に再取得し、一致した確認から30分以内に記録してください。写真ファイルの中身やJavaScript実行後の変更は判定しません。</p>
      {!draft.origin.baseline ? <p>原本が未紐付けのため技術確認を進められません。公開HTMLを取得して新しい下書きを作成してください。</p> : <>
        <p className="meta">原本取得日時 {draft.origin.baseline.fetchedAt} / 最終確認 {draft.origin.checkedAt ?? "未実施"}</p>
        <p>原本タイトル：{draft.origin.baseline.title}</p>
        <button className="secondary" disabled={busy} onClick={() => { void recheck() }}>{busy ? "確認しています…" : "公開ページを再取得して確認"}</button>
        {draft.origin.status === "unchanged" && <p className="status">原本HTMLと一致しています。確認結果は30分間有効です。</p>}
        {draft.origin.status === "changed" && <p className="error">公開HTMLの変更を検知しました。過去の技術確認は現在の承認として使えません。公開内容と元JSONを見直し、新しい原本から下書きを作り直してください。</p>}
        {draft.origin.status === "failed" && <p className="error">公開ページを再取得できませんでした。通信状態を確認して再試行してください。技術確認は記録できません。</p>}
        {draft.origin.status === "expired" && <p className="hint">確認から30分を過ぎています。再取得してから技術確認を記録してください。</p>}
        {draft.origin.latest && <><p><Link href={`/seo/sources/${draft.origin.latest.id}`}>再取得した公開ページの記録を見る</Link></p>{draft.origin.status === "changed" && <dl><dt>再取得したタイトル</dt><dd>{draft.origin.latest.title}</dd><dt>H1</dt><dd>{draft.origin.latest.h1.join(" / ")}</dd><dt>説明文</dt><dd>{draft.origin.latest.description}</dd></dl>}</>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    </section>
    <section className="panel"><h2>変更差分</h2>{draft.changes.map(c => <div key={c.field}><h3>{labels[c.field]}</h3><div className="seo-columns"><div><small>変更前</small><p className="preserve">{c.before}</p></div><div><small>変更案</small><p className="preserve">{c.after}</p></div></div></div>)}</section>
    <section className="panel"><h2>技術確認</h2>
      <p>現在の利用者：{reviewerLabel}</p>
      {!draft.canReview && <p className="hint">記録には有効な公開原本の確認と、依頼者とは別の技術確認担当者が必要です。</p>}
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
