import { appContext } from "../../../../lib/server"
import { seoJsonCommand } from "../../../../lib/seo-json-command"
import { createSeoMetadataDraft, seoMetadataGeneratorFromEnv } from "../../../../../../src/application/seo-draft"
export const runtime = "nodejs"
export async function POST(request: Request) {
  return seoJsonCommand(request, 1_000_000, async input => ({ draft: await createSeoMetadataDraft(appContext(), input, seoMetadataGeneratorFromEnv()) }))
}
