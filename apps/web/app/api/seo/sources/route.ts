import { appContext } from "../../../../lib/server"
import { seoJsonCommand } from "../../../../lib/seo-json-command"
import { importSeoPublicSource } from "../../../../../../src/application/seo-source"
export const runtime = "nodejs"
export async function POST(request: Request) {
  return seoJsonCommand(request, 1000, async input => ({ source: await importSeoPublicSource(appContext().dataRoot, input) }))
}
