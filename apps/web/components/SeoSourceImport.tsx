"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import type { SeoPublicSource } from "../../../src/application/seo-source"
import type { PublicAchievement } from "../../../src/schema"
export default function SeoSourceImport({ url, document, onSource }: { url?: string; document?: PublicAchievement | null; onSource?: (source: SeoPublicSource | null) => void }) {
  const router = useRouter()
  const [source, setSource] = useState<SeoPublicSource | null>(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState("")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    setBusy(true); setError(""); setSource(null)
    onSource?.(null)
    try {
      const response = await fetch("/api/seo/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url ?? String(data.get("url") ?? "").trim() }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error ?? "取得できませんでした。")
      setSource(body.source)
      onSource?.(body.source)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : "取得できませんでした。") } finally { setBusy(false) }
  }
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim()
  const comparisons = source && document ? (["title", "h1", "description"] as const).map(field => {
    const live = field === "h1" ? source.h1.join(" / ") : source[field]
    return { field, live, stored: document.generated[field], matches: normalize(live) === normalize(document.generated[field]) }
  }) : []
  return <div className="stack seo-source-import">
    <h3>公開ページを取得して照合する</h3>
    <p className="hint">公開HTMLとSEO要素をサーバーへ保存します。写真のファイルは取得せず、AIへ送信しません。実験の根拠や構造化JSONはHTMLから自動生成しません。</p>
    <form className="form" onSubmit={submit}><fieldset disabled={busy}><legend>公開ページの取り込み</legend>
      {url ? <p className="preserve">{url}</p> : <label>TSサイトの公開URL<input type="url" name="url" required placeholder="https://www.macsystems.co.jp/ts/achievement/bga/" /></label>}
      <button className="secondary">{busy ? "取得しています…" : "公開ページを取得"}</button>
    </fieldset></form>
    {error && <p className="error" role="alert">{error}</p>}
    {source && <div role="status"><p>公開HTMLを保存しました。取得日時：{source.fetchedAt}</p><dl><dt>タイトル</dt><dd>{source.title || "なし"}</dd><dt>H1（{source.h1.length}件）</dt><dd>{source.h1.join(" / ") || "なし"}</dd><dt>説明文</dt><dd>{source.description || "なし"}</dd></dl>
      <p>HTML内の画像 {source.images.length}件 / 表 {source.tables}件 / 動画・埋込 {source.embeds}件</p>
      <p><Link href={`/seo/sources/${source.id}`}>保存したHTMLと詳細を確認</Link></p>
      {!!comparisons.length && <div><h4>アップロードしたJSONとの照合</h4><p className="hint">空白を整えた文章の一致だけを確認します。会社名の付加なども相違として表示します。一致しても本文・写真・数値の正確さは別途確認が必要です。</p>{comparisons.map(c => <div key={c.field}><strong>{c.field}：{c.matches ? "一致" : "相違あり・確認が必要"}</strong>{!c.matches && <dl><dt>公開ページ</dt><dd>{c.live || "なし"}</dd><dt>JSON</dt><dd>{c.stored}</dd></dl>}</div>)}</div>}
    </div>}
  </div>
}
