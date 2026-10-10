import Link from "next/link"
import { appContext } from "../../../lib/server"
import { listSeoDrafts } from "../../../../../src/application/seo-draft-review"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export default function SeoDraftsPage() {
  const { drafts, unreadable } = listSeoDrafts(appContext())
  return <div className="stack seo-dashboard">
    <p className="back"><Link href="/seo">← SEO作業に戻る</Link></p>
    <section className="panel"><h1>保存したSEO下書き</h1><p>サーバーに保存した修正案を開き、差分と技術確認の記録を確認できます。公開の承認・実行は別途必要です。</p>
      {unreadable > 0 && <p className="error" role="alert">{unreadable}件は保存データが不完全、または変更されているため読み込めません。保存ファイルを確認してください。</p>}
      {!drafts.length ? <p>読み込める下書きはありません。SEO作業から修正案を作成してください。</p> : <ul className="claim-list">{drafts.map(d => <li key={d.jobId}>
        <h2><Link href={`/seo/drafts/${d.jobId}`}>{d.title}</Link></h2><p>{d.phaseLabel} / {d.pendingCount}件確認待ち</p>
        <p className="meta">作成日時 {d.createdAt} / {d.jobId}</p><a href={d.sourceUrl} target="_blank" rel="noreferrer">対象の公開ページを見る</a>
      </li>)}</ul>}
    </section>
  </div>
}
