import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { HarnessError } from "../errors.ts"
import { resolveInsideRoot } from "../paths.ts"
import { PublicAchievementSchema, type PublicAchievement } from "../schema.ts"

const UploadId = z.string().regex(/^photo-[a-f0-9]{8}$/)
const JobId = z.string().regex(/^job-[a-f0-9]{8}$/)
const AchievementPath = z.string().regex(/^content\/achievements\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/)

const UploadRecord = z
  .object({
    id: UploadId,
    file: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/),
    relativePath: z.string().regex(/^public\/images\/achievement\/img-[a-f0-9]{16}\.webp$/),
  })
  .strict()

const StoredClaim = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    location: z.string().min(1),
    kind: z.enum(["number", "mechanism", "standard", "comparison", "house-stance", "caption", "other"]),
    source: z.enum(["facts", "brief", "claims", "verified", "ai-general"]),
    sourceRef: z.string().min(1).optional(),
    status: z.enum(["pending", "ok"]),
    reviewer: z.string().min(1).optional(),
    textHash: z.string().min(1).optional(),
    decidedAt: z.string().min(1).optional(),
  })
  .strict()

export const StoredJob = z
  .object({
    jobId: JobId,
    recipe: z.literal("achievement"),
    requestedBy: z.string().min(1),
    contentPath: AchievementPath,
    claims: z.array(StoredClaim),
    writtenPaths: z.array(z.string()),
    riskTier: z.enum(["L1", "L2"]),
  })
  .strict()

export type UploadRecord = z.infer<typeof UploadRecord>
export type StoredJob = z.infer<typeof StoredJob>

/** `.sitebot` をUIから直接読ませず、あとからDBへ差し替えられる境界。 */
export class FileJobRepository {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true })
  }

  saveUpload(upload: UploadRecord): void {
    const parsed = UploadRecord.parse(upload)
    this.write(`.sitebot/uploads/${parsed.id}.json`, parsed)
  }

  getUpload(id: string): UploadRecord | undefined {
    if (!UploadId.safeParse(id).success) return undefined
    return this.read(`.sitebot/uploads/${id}.json`, UploadRecord)
  }

  readJob(jobId: string): StoredJob | undefined {
    if (!JobId.safeParse(jobId).success) return undefined
    return this.read(`.sitebot/jobs/${jobId}.json`, StoredJob)
  }

  readAchievementImage(file: string): Buffer | undefined {
    if (!/^img-[a-f0-9]{16}\.webp$/.test(file)) return undefined
    const target = resolveInsideRoot(this.root, `public/images/achievement/${file}`)
    try {
      return readFileSync(target)
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  readAchievement(contentPath: string): PublicAchievement | undefined {
    if (!AchievementPath.safeParse(contentPath).success) {
      throw new HarnessError("C23", "job content path is not an achievement")
    }
    return this.read(contentPath, PublicAchievementSchema)
  }

  private write(relative: string, value: unknown): void {
    const target = resolveInsideRoot(this.root, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(value, null, 2) + "\n")
  }

  private read<S extends z.ZodTypeAny>(relative: string, schema: S): z.output<S> | undefined {
    const target = resolveInsideRoot(this.root, relative)
    try {
      const parsed = schema.safeParse(JSON.parse(readFileSync(target, "utf8")))
      return parsed.success ? parsed.data : undefined
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}
