"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import SeoWorkItems from "./SeoWorkItems"
import { addTask } from "../../../src/seo/tasks"
import { analyze, candidates, ctr, type Finding } from "../../../src/seo/analyze"
import { importPagesCsv } from "../../../src/seo/csv"
import { demoWorkspace } from "../../../src/seo/demo"
import { attachComparison, ComparisonSchema, emptyWorkspace, MAX_CSV_BYTES, PageSchema, SITE, WorkspaceSchema, type Page, type Workspace } from "../../../src/seo/model"

const KEY = "sitebot.seo.v1"
const statuses = { candidate: "改善候補", observing: "経過観察", insufficient: "データ不足", stable: "定期確認" }
const kinds = { service: "サービス", achievement: "実績", column: "コラム", other: "その他" }
function message(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) return (error as { issues: Array<{ message: string }> }).issues.map(i => i.message).join(" / ")
  return error instanceof Error ? error.message : "処理できませんでした。入力を確認してください。"
}
function percent(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(2)}%` }
function metrics(f: Finding) {
  const c = f.current, p = f.previous
  return <div className="seo-metrics">
    <span>クリック <b>{p?.clicks ?? "—"} → {c?.clicks ?? "—"}</b></span>
    <span>表示回数 <b>{p?.impressions ?? "—"} → {c?.impressions ?? "—"}</b></span>
    <span>CTR <b>{percent(ctr(p))} → {percent(ctr(c))}</b></span>
    <span>平均掲載順位 <b>{p?.position?.toFixed(1) ?? "—"} → {c?.position?.toFixed(1) ?? "—"}</b></span>
  </div>
}
function download(workspace: Workspace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }))
  const a = document.createElement("a"); a.href = url; a.download = workspace.demo ? "seo-demo.json" : "seo-workspace.json"; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function SeoDashboard() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState("all")
  const [editing, setEditing] = useState<Page | null>(null)
  const [adding, setAdding] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setWorkspace(WorkspaceSchema.parse(JSON.parse(raw))) }
    catch { setError("保存データを読み込めませんでした。元データは上書きしていません。バックアップを復元するか、確認して初期化してください。") }
    setReady(true)
  }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  function commit(next: Workspace, success: string) {
    const valid = WorkspaceSchema.parse(next)
    try { localStorage.setItem(KEY, JSON.stringify(valid)) }
    catch { throw new Error("ブラウザへ保存できませんでした。空き容量や保存設定を確認してください。現在のデータは変更していません。") }
    setWorkspace(valid); setError(""); setNotice(success)
  }
  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      if (workspace.demo) throw new Error("実データを入れる前に「デモを終了する」を押してください。")
      const getRows = async (name: string) => {
        const file = data.get(name)
        if (!(file instanceof File) || !file.size) throw new Error("両期間のページ別CSVを選択してください。")
        if (file.size > MAX_CSV_BYTES) throw new Error("CSVは2MB以下にしてください。")
        return importPagesCsv(await file.text())
      }
      const comparison = ComparisonSchema.parse({
        previous: { start: data.get("previousStart"), end: data.get("previousEnd"), rows: await getRows("previousFile") },
        current: { start: data.get("currentStart"), end: data.get("currentEnd"), rows: await getRows("currentFile") },
        filters: data.get("filters"), confirmed: data.get("confirmed") === "on", importedAt: new Date().toISOString(),
      })
      commit(attachComparison(workspace, comparison), "2つの期間を取り込みました。未登録のURLは台帳に追加しました。")
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      const page = PageSchema.parse({ url: data.get("url"), title: data.get("title"), kind: data.get("kind"), purpose: data.get("purpose"), businessFit: data.get("businessFit") === "" ? null : Number(data.get("businessFit")), lastEdited: data.get("lastEdited") || null })
      if (adding && workspace.pages.some(p => p.url === page.url)) throw new Error("このURLは登録済みです。既存の行を編集してください。")
      commit({ ...workspace, pages: adding ? [...workspace.pages, page] : workspace.pages.map(p => p.url === editing?.url ? page : p) }, "ページ台帳を保存しました。")
      setEditing(null); setAdding(false)
    } catch (e) { setError(message(e)) }
  }
  async function restore(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 5_000_000) throw new Error("バックアップは5MB以下にしてください。")
      const next = WorkspaceSchema.parse(JSON.parse(await file.text()))
      if (!window.confirm("現在の台帳と検索データを、このバックアップで置き換えますか？")) return
      commit(next, "バックアップを復元しました。")
      setEditing(null); setAdding(false)
    } catch (e) { setError(message(e)) }
  }
  const findings = analyze(workspace), top = candidates(findings)
  const visible = findings.filter(f => filter === "all" || f.status === filter)
  const comparison = workspace.comparison
  const disabled = !ready || busy
  return <div className="stack seo-dashboard">
    <p className="back"><Link href="/">← 作業を選ぶ</Link></p>
    <section className="panel">
      <p className="eyebrow">TSサイトの運用</p><h1>検索から、次に直すページを見つける</h1>
      <p className="lede">検索データと依頼につながる重要度を見て、今週取り組む1〜2件を選びます。</p>
      <p className="hint">データはこのブラウザ内に保存します。CSV・台帳はサーバーや外部AIへ送信しません。端末間では共有されないため、バックアップを保存してください。</p>
      <div className="actions">
        <Link href="/seo/drafts">保存したSEO下書きを開く</Link>
        {!workspace.demo ? <button className="secondary" disabled={disabled || !!comparison} onClick={() => { try { if (window.confirm("デモに切り替えます。現在の台帳を残す場合は先にバックアップしてください。")) { commit(demoWorkspace(), "架空データのデモです。"); setEditing(null); setAdding(false) } } catch (e) { setError(message(e)) } }}>架空データで試す</button> : <button disabled={disabled} onClick={() => { try { commit(emptyWorkspace(), "デモを終了しました。実データを取り込めます。"); setEditing(null); setAdding(false) } catch (e) { setError(message(e)) } }}>デモを終了する</button>}
        <button className="secondary" disabled={disabled} onClick={() => download(workspace)}>バックアップを保存</button>
        <label className="seo-file">バックアップを復元<input type="file" accept=".json,application/json" disabled={disabled} onChange={e => { void restore(e.target.files?.[0]); e.target.value = "" }} /></label>
      </div>
    </section>
    {error && <div className="error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
    {notice && <p className="status" role="status">{notice}</p>}
    {workspace.demo && <div className="status"><strong>デモ表示：数値・重要度・更新日はすべて架空です。</strong></div>}
    <section className="panel">
      <h2>1. 検索データを取り込む</h2>
      <p>Search Consoleで同じ検索条件の「ページ」タブを、前期間と今回の期間に分けてCSVで書き出してください。ZIPの場合は展開して「ページ.csv / Pages.csv」を選びます。</p>
      <details><summary>取り込み条件と注意点</summary><ul>
        <li>対象は {SITE} 配下です。他部署を含む場合は、Search ConsoleでページURLを絞り込んでください。</li>
        <li>クリック数・表示回数・CTR・掲載順位を選択。期間比較モードのCSVやクエリCSVは使いません。</li>
        <li>日付はSearch Consoleで指定した日付のまま入力。同じ日数で重ならない期間を選び、確定済みのデータを使ってください。</li>
        <li>出力上限などにより全ページが揃わない場合があります。未掲載の行はゼロではありません。</li>
        <li>CTRはクリック数÷表示回数で再計算します。ページの平均順位から個別キーワードの順位は分かりません。</li>
      </ul><a href="https://support.google.com/webmasters/answer/7576553?hl=ja" target="_blank" rel="noreferrer">Search Console公式ヘルプ</a></details>
      <form onSubmit={importCsv} className="form">
        <fieldset disabled={disabled || workspace.demo}><legend>同じ条件の2期間</legend>
          <div className="seo-columns">{(["previous", "current"] as const).map((key, i) => <div key={key}>
            <h3>{i === 0 ? "前期間" : "今回の期間"}</h3>
            <label>開始日<input type="date" name={`${key}Start`} required /></label>
            <label>終了日<input type="date" name={`${key}End`} required /></label>
            <label>ページ別CSV<input type="file" name={`${key}File`} accept=".csv,text/csv" required /></label>
          </div>)}</div>
          <label>検索条件のメモ<input type="text" name="filters" maxLength={500} required placeholder="ウェブ / 国・デバイス指定なし / ページURLはTS配下" /></label>
          <label className="choice"><input type="checkbox" name="confirmed" required />両期間のプロパティ・検索タイプ・国・デバイス・その他フィルタが同じで、期間と確定データを確認しました。</label>
          <button type="submit">{busy ? "確認しています…" : "取り込んで比較する"}</button>
        </fieldset>
      </form>
      {comparison && <div className="seo-period"><strong>前期間 {comparison.previous.start}〜{comparison.previous.end} → 今回 {comparison.current.start}〜{comparison.current.end}</strong><br />{comparison.filters}<br />取込日時 {comparison.importedAt} / {comparison.previous.rows.length}行 → {comparison.current.rows.length}行</div>}
    </section>
    <section className="panel">
      <h2>2. 改善候補を確認する</h2>
      <p className="hint">最大5件。重要度が未設定の候補は暫定表示です。検索数値だけで新規記事・削除・書き換えを決めません。</p>
      {top.length === 0 ? <p className="drop">{comparison ? "現在の条件で改善候補はありません。下の台帳で「データ不足」「経過観察」も確認してください。" : "検索データを取り込むと、確認理由と次にすることが表示されます。"}</p> : <ol className="seo-candidates">{top.map(f => <li key={f.page.url}>
        <h3><a href={f.page.url} target="_blank" rel="noreferrer">{f.page.title}</a></h3>
        <p className="meta">{f.score === null ? "重要度未設定・優先順は暫定" : `確認優先度 ${f.score}（社内の目安）`}</p>
        {metrics(f)}<p>{f.reason}</p><p><strong>次にすること：</strong>{f.next}</p>
        <button className="secondary" disabled={disabled || workspace.tasks.some(t => t.page.url === f.page.url && !["done", "cancelled"].includes(t.status))} onClick={() => { try { commit(addTask(workspace, f.page.url, new Date().toISOString(), `seo-${crypto.randomUUID()}`), "今週の作業に追加しました。下の作業欄で調査・準備を進めてください。") } catch (e) { setError(message(e)) } }}>今週の作業に追加</button>
      </li>)}</ol>}
      <details><summary>候補を選ぶルール</summary><p>両期間100表示以上が比較の目安です。クリック減少と平均順位2以上の悪化、順位差1以内でCTRが1ポイント以上低下、または今回の平均順位4〜15を確認対象にします。優先度は重要度×3＋確認理由の点数（3・2・1）。Googleの評価や成果予測ではありません。更新から集計終了まで28日未満は経過観察としますが、不具合・誤記は随時修正します。</p></details>
    </section>
    <SeoWorkItems key={workspace.demo ? "demo" : "real"} workspace={workspace} disabled={disabled} onSave={commit} onError={e => setError(message(e))} />
    <section className="panel">
      <h2>4. ページ台帳</h2><p className="hint">初期登録は公開URLの確認候補26件です。名称・目的・重要度・更新日はここで整えます。登録は公開・インデックス状況を保証しません。</p>
      <div className="actions"><label>表示する状態<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">すべて（{findings.length}）</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}（{findings.filter(f => f.status === key).length}）</option>)}</select></label><button className="secondary" disabled={disabled} onClick={() => { setEditing(null); setAdding(true) }}>ページを登録</button></div>
      {(adding || editing) && <form className="form seo-editor" key={editing?.url ?? "new"} onSubmit={savePage}>
        <fieldset disabled={disabled}><legend>{adding ? "ページを登録" : "台帳を編集"}</legend>
          <label>URL<input type="text" name="url" required defaultValue={editing?.url ?? SITE} readOnly={!adding} /></label>
          <label>管理用の名称<input type="text" name="title" required maxLength={200} defaultValue={editing?.title} /></label>
          <label>種類<select name="kind" defaultValue={editing?.kind ?? "other"}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>目的・想定する相談<textarea name="purpose" maxLength={500} defaultValue={editing?.purpose} placeholder="顧客名や秘密情報は記入しないでください。" /></label>
          <label>依頼につながる重要度<select name="businessFit" defaultValue={editing?.businessFit ?? ""}><option value="">未設定</option><option value="3">3：依頼・見積相談に直結</option><option value="2">2：比較検討を支える</option><option value="1">1：技術理解を支える</option><option value="0">0：現在の集客対象外</option></select></label>
          <label>最後に内容を更新した日（不明なら空欄）<input type="date" name="lastEdited" defaultValue={editing?.lastEdited ?? ""} /></label>
          <div className="actions"><button>保存</button><button className="secondary" type="button" onClick={() => { setEditing(null); setAdding(false) }}>キャンセル</button></div>
        </fieldset>
      </form>}
      <div className="seo-table"><table><caption>ページごとの検索状況（前期間 → 今回）</caption><thead><tr><th>ページ</th><th>状態・根拠</th><th>検索数値</th><th>台帳</th></tr></thead><tbody>{visible.map(f => <tr key={f.page.url}>
        <td><a href={f.page.url} target="_blank" rel="noreferrer">{f.page.title}</a><small>{new URL(f.page.url).pathname}{new URL(f.page.url).search}</small><small>{kinds[f.page.kind]} / 重要度 {f.page.businessFit ?? "未設定"}</small>{f.page.purpose && <p>{f.page.purpose}</p>}</td>
        <td><strong>{statuses[f.status]}</strong><p>{f.reason}</p><details><summary>次にすること</summary>{f.next}</details></td>
        <td>{metrics(f)}</td><td><small>更新日 {f.page.lastEdited ?? "不明"}</small><button className="secondary" disabled={disabled} onClick={() => { setAdding(false); setEditing(f.page) }}>編集</button></td>
      </tr>)}</tbody></table></div>
    </section>
    <details className="panel"><summary>保存データの初期化</summary><p>このブラウザの台帳・検索データを消去します。必要な場合は先にバックアップしてください。</p><button className="secondary" disabled={disabled} onClick={() => { if (window.confirm("このブラウザのSEOデータを初期化しますか？")) { try { commit(emptyWorkspace(), "初期化しました。"); setEditing(null); setAdding(false) } catch (e) { setError(message(e)) } } }}>初期化する</button></details>
  </div>
}
