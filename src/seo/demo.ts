import { emptyWorkspace, type Workspace } from "./model.ts"
export function demoWorkspace(): Workspace {
  const base = emptyWorkspace()
  const urls = base.pages.slice(0, 4).map(p => p.url)
  base.pages = base.pages.map((p, i) => ({ ...p, businessFit: i < 4 ? 3 : null, lastEdited: i === 3 ? "2026-09-25" : null }))
  return { ...base, demo: true, comparison: {
    previous: { start: "2026-08-01", end: "2026-08-28", rows: urls.map(url => ({ url, clicks: 40, impressions: 400, position: 5 })) },
    current: { start: "2026-09-01", end: "2026-09-28", rows: urls.map((url, i) => ({ url, clicks: i === 1 ? 5 : 20, impressions: i === 1 ? 50 : 400, position: i === 0 ? 8 : 5 })) },
    filters: "架空データ / ウェブ / 全ての国・デバイス", confirmed: true, importedAt: "2026-09-30T00:00:00.000Z",
  } }
}
