import Link from "next/link"
import { notFound } from "next/navigation"
import { appContext } from "../../../../lib/server"
import { getSeoDraftReview } from "../../../../../../src/application/seo-draft-review"
import SeoDraftReview from "../../../../components/SeoDraftReview"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export default async function SeoDraftPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const ctx = appContext()
  let draft
  try { draft = getSeoDraftReview(ctx, jobId) }
  catch { return <section className="panel"><h1>下書きを読み込めません</h1><p>保存データの変更や破損があるため、確認記録を引き継げません。元データを確認して下書きを作り直してください。</p><Link href="/seo/drafts">下書き一覧に戻る</Link></section> }
  if (!draft) notFound()
  return <SeoDraftReview initial={draft} reviewerLabel={ctx.user.displayName} />
}
