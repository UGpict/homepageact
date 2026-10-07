import { randomBytes } from "node:crypto"
import path from "node:path"
import { HarnessError } from "../errors.ts"
import { writePublicImage } from "../images.ts"
import { runAchievementJob } from "../run-job.ts"
import { loadSitePack } from "../sitepack.ts"
import { harnessErrorToHuman, inputError } from "./errors.ts"
import { buildAchievementFacts } from "./form.ts"
import { toJobView, type JobView } from "./job-view.ts"
import type { GenerationProvider } from "./provider.ts"
import { FileJobRepository } from "./repository.ts"
import type { CurrentUser, FormOptions, HumanError, TagGroup } from "./types.ts"

export type AppContext = {
  packRoot: string
  dataRoot: string
  user: CurrentUser
  provider: GenerationProvider
  confidentialTerms: string[]
  now?: string
  today?: string
}

export type DraftResult = { ok: true; job: JobView } | { ok: false; error: HumanError }

export type ImageResult =
  | { ok: true; upload: { id: string; file: string } }
  | { ok: false; error: HumanError }

const WORK_CONTEXTS: FormOptions["workContexts"] = [
  { id: "customer", label: "お客様の案件" },
  { id: "internal", label: "社内の検証" },
  { id: "partner", label: "関連会社との共同" },
]

const TAG_LABEL: Record<TagGroup, string> = {
  components: "対象",
  materials: "材料",
  methods: "方法",
  purposes: "目的",
  industries: "業種",
}

export function tagGroupLabel(group: TagGroup): string {
  return TAG_LABEL[group]
}

export function confidentialTermsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.SITEBOT_CONFIDENTIAL_TERMS
  if (!raw) return []
  return raw
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter(Boolean)
}

export function getFormOptions(ctx: Pick<AppContext, "packRoot">): FormOptions {
  const pack = loadSitePack(ctx.packRoot)
  const tagGroups = (Object.keys(TAG_LABEL) as TagGroup[]).map((group) => ({
    id: group,
    label: TAG_LABEL[group],
    terms: Object.entries(pack.taxonomy[group]).map(([id, term]) => ({
      id,
      label: term.label,
    })),
  }))
  return { workContexts: WORK_CONTEXTS, tagGroups }
}

export async function prepareAchievementImage(
  ctx: AppContext,
  input: { bytes: Buffer; sourceName: string },
): Promise<ImageResult> {
  const pack = loadSitePack(ctx.packRoot)
  const repository = new FileJobRepository(ctx.dataRoot)
  const sourceName = path.basename(input.sourceName).replaceAll("\0", "") || "upload"
  try {
    const written = await writePublicImage({
      root: ctx.dataRoot,
      pack,
      kind: "achievement",
      sourceName,
      bytes: input.bytes,
    })
    const id = `photo-${randomBytes(4).toString("hex")}`
    repository.saveUpload({ id, file: written.file, relativePath: written.relativePath })
    return { ok: true, upload: { id, file: written.file } }
  } catch (error) {
    return { ok: false, error: toHuman(error) }
  }
}

export async function createAchievementDraft(ctx: AppContext, form: unknown): Promise<DraftResult> {
  const pack = loadSitePack(ctx.packRoot)
  const repository = new FileJobRepository(ctx.dataRoot)
  const now = ctx.now ?? new Date().toISOString()
  const built = buildAchievementFacts(form, {
    taxonomy: pack.taxonomy,
    user: ctx.user,
    now,
    lookupUpload: (id) => repository.getUpload(id),
  })
  if (!built.ok) return built

  const jobId = `job-${randomBytes(4).toString("hex")}`
  try {
    const run = await runAchievementJob({
      root: ctx.dataRoot,
      pack,
      jobId,
      requestedBy: ctx.user.id,
      now,
      today: ctx.today ?? now.slice(0, 10),
      facts: built.facts,
      confidentialTerms: ctx.confidentialTerms,
      generate: (payload) => ctx.provider.generate(payload),
    })
    return { ok: true, job: toJobView(run.job, run.doc, pack) }
  } catch (error) {
    return { ok: false, error: toHuman(error) }
  }
}

export function readPublicImage(ctx: Pick<AppContext, "dataRoot">, file: string): Buffer | undefined {
  return new FileJobRepository(ctx.dataRoot).readAchievementImage(file)
}

export function getJob(ctx: Pick<AppContext, "packRoot" | "dataRoot">, jobId: string): JobView | undefined {
  const repository = new FileJobRepository(ctx.dataRoot)
  const job = repository.readJob(jobId)
  if (!job) return undefined
  const doc = repository.readAchievement(job.contentPath)
  if (!doc) return undefined
  return toJobView(job, doc, loadSitePack(ctx.packRoot))
}

function toHuman(error: unknown): HumanError {
  if (error instanceof HarnessError) return harnessErrorToHuman(error)
  return inputError(
    "下書きを作成できませんでした",
    "文章の作成中に問題が起きました。",
    "時間をおいて、もう一度お試しください。",
    undefined,
    error instanceof Error ? error.message : "unknown",
  )
}
