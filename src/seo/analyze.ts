import { day, type Metric, type Page, type Workspace } from "./model.ts"
export function ctr(metric: Metric | undefined): number | null {
  return metric && metric.impressions > 0 ? metric.clicks / metric.impressions : null
}
export type Finding = {
  page: Page; current?: Metric; previous?: Metric
  status: "candidate" | "observing" | "insufficient" | "stable"
  reason: string; next: string; score: number | null
}
export function analyze(workspace: Workspace): Finding[] {
  const comparison = workspace.comparison
  const current = new Map(comparison?.current.rows.map(r => [r.url, r]))
  const previous = new Map(comparison?.previous.rows.map(r => [r.url, r]))
  return workspace.pages.map(page => {
    const c = current.get(page.url), p = previous.get(page.url)
    const base = { page, current: c, previous: p }
    const result = (status: Finding["status"], reason: string, next: string, opportunity = 0): Finding => ({
      ...base, status, reason, next, score: status === "candidate" && page.businessFit !== null ? page.businessFit * 3 + opportunity : null,
    })
    if (!comparison || !c || !p) return result("insufficient", "両期間のページ行が揃っていません。未掲載はゼロとみなしません。", "対象期間・フィルタ・CSVの出力範囲を確認する。")
    if (page.lastEdited && day(comparison.current.end) - day(page.lastEdited) < 28) return result("observing", "最終更新から、今回の集計終了日まで28日未満です。", "更新内容を確認し、次の期間でも経過を見る。不具合や誤記は待たずに修正する。")
    if (c.impressions < 100 || p.impressions < 100) return result("insufficient", "いずれかの期間が100表示未満です。価値が低いという判定ではありません。", "期間を延ばすか、問い合わせ実績とあわせて個別判断する。")
    if (c.position === null || p.position === null) return result("insufficient", "掲載順位を比較できません。", "元のCSVを確認する。")
    if (page.businessFit === 0) return result("stable", "台帳で集客対象外に設定されています。", "対象に戻す場合は重要度を変更する。")
    const decline = c.clicks < p.clicks
    if (decline && c.position - p.position >= 2) return result("candidate", "クリック減少と平均掲載順位の悪化が見られます。", "Search ConsoleでこのURLのクエリを確認し、検索意図・競合・ページ内容の変化を調べる。", 3)
    if (decline && Math.abs(c.position - p.position) <= 1 && ctr(p)! - ctr(c)! >= 0.01) return result("candidate", "平均掲載順位の変化は1以内で、CTRが1ポイント以上低下しています。", "検索結果・タイトル・クエリ構成の変化を確認する。AIによる回答が原因とは断定しない。", 2)
    if (c.position >= 4 && c.position <= 15) return result("candidate", "ページ単位の平均掲載順位が4〜15です。個別クエリの順位は未確認です。", "対象URLの商談につながるクエリを確認し、説明・検証写真・相談導線の不足を調べる。", 1)
    return result("stable", "現在のルールでは優先的な確認対象に該当しません。", "問い合わせ実績と次回の検索データを確認する。")
  })
}
export function candidates(findings: Finding[]): Finding[] {
  return findings.filter(f => f.status === "candidate").sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.page.url.localeCompare(b.page.url)).slice(0, 5)
}
