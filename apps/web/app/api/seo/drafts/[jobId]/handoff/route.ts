import { appContext } from "../../../../../../lib/server"
import { seoJsonCommand } from "../../../../../../lib/seo-json-command"
import { exportSeoDraftHandoff } from "../../../../../../../../src/application/seo-draft-review"
export const runtime = "nodejs"
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return seoJsonCommand(request, 16000, async input => {
    const { jobId } = await params
    return { handoff: await exportSeoDraftHandoff(appContext(), jobId, input) }
  })
}
