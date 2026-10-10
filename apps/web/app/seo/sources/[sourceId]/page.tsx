import Link from "next/link"
import { notFound } from "next/navigation"
import { appContext } from "../../../../lib/server"
import { getSeoPublicSource } from "../../../../../../src/application/seo-source"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export default async function SourcePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params
  let record
  try { record = getSeoPublicSource(appContext().dataRoot, sourceId) }
  catch { return <section className="panel"><h1>保存データを読み込めません</h1><Link href="/seo/sources">公開ページを再取得する</Link></section> }
  if (!record) notFound()
  const s = record.snapshot
  return <div className="stack seo-dashboard"><p><Link href="/seo/sources">← 取得履歴へ</Link></p><section className="panel"><h1>取得した公開ページ</h1><p><a href={s.url} target="_blank" rel="noreferrer">現在の公開ページを見る</a></p><p className="meta">取得日時 {s.fetchedAt}</p>
    <dl><dt>タイトル</dt><dd>{s.title || "なし"}</dd><dt>H1（{s.h1.length}件）</dt><dd>{s.h1.join(" / ") || "なし"}</dd><dt>説明文</dt><dd>{s.description || "なし"}</dd><dt>canonical</dt><dd>{s.canonical.join(" / ") || "なし"}</dd><dt>robots / googlebot</dt><dd>{s.robots.join(" / ") || "HTML内に指定なし"}</dd></dl>
    <a href={`/api/seo/sources/${s.id}`} download>元HTMLをダウンロード</a><p className="hint">HTMLは変更せず保存しています。スクリプトの実行や画面表示後のDOM、HTTPヘッダー、写真ファイルは取得対象外です。表 {s.tables}件 / 動画・埋込 {s.embeds}件。</p>
    <details><summary>保存データの識別情報</summary><p className="preserve">{s.id}<br />SHA-256 {s.htmlHash}</p></details>
    </section><section className="panel"><h2>見出し一覧</h2><ol>{s.headings.map((h,i) => <li key={i}>H{h.level}：{h.text}</li>)}</ol></section>
    <section className="panel"><h2>HTML内の画像（{s.images.length}件）</h2><p className="hint">画像の表示や内容の検証は行っていません。</p><ul>{s.images.map((image,i) => <li key={i}><p className="preserve">{image.src || "srcなし"}</p><p>alt：{image.alt || "なし"}</p></li>)}</ul></section>
  </div>
}
