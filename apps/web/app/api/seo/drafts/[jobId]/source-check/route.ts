import { appContext } from "../../../../../../lib/server"
import { seoJsonCommand } from "../../../../../../lib/seo-json-command"
import { recheckSeoDraftSource } from "../../../../../../../../src/application/seo-draft-review"
export const runtime = "nodejs"
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return seoJsonCommand(request, 1000, async input => {
    const { jobId } = await params
    return { draft: await recheckSeoDraftSource(appContext(), jobId, input) }
  })
}
