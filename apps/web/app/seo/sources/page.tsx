import Link from "next/link"
import { appContext } from "../../../lib/server"
import { listSeoPublicSources } from "../../../../../src/application/seo-source"
import SeoSourceImport from "../../../components/SeoSourceImport"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export default function SourcesPage() {
  const { sources, unreadable } = listSeoPublicSources(appContext().dataRoot)
  return <div className="stack seo-dashboard"><p className="back"><Link href="/seo">← SEO作業に戻る</Link></p>
    <section className="panel"><h1>公開ページの取り込み</h1><SeoSourceImport /></section>
    <section className="panel"><h2>保存した公開HTML</h2><p className="hint">過去の取得時点の内容です。最新の状態を確認する場合は再取得してください。</p>
      {unreadable > 0 && <p role="alert" className="error">{unreadable}件は保存データを読み込めません。再取得してください。</p>}
      {!sources.length ? <p>まだ取得したページはありません。</p> : <ul className="claim-list">{sources.map(s => <li key={s.id}><Link href={`/seo/sources/${s.id}`}>{s.title || s.url}</Link><p className="preserve">{s.url}</p><p className="meta">{s.fetchedAt}</p></li>)}</ul>}
    </section></div>
}
