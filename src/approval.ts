import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { HarnessError } from "./errors.ts"

export const ApprovalRecord = z
  .object({
    commitSha: z.string().regex(/^[0-9a-f]{7,64}$/),
    role: z.enum(["final", "requester"]),
    approvedBy: z.string().min(1),
    approvedAt: z.string().min(1),
  })
  .strict()

export type ApprovalRecord = z.infer<typeof ApprovalRecord>

const ApprovalFile = z
  .object({
    records: z.array(ApprovalRecord),
  })
  .strict()

/** 承認は公開JSONではなく、gitignore されたストアに SHA をキーとして置く。 */
export class ApprovalStore {
  private records: ApprovalRecord[]

  constructor(records: ApprovalRecord[] = []) {
    this.records = records
  }

  approve(record: ApprovalRecord): void {
    const parsed = ApprovalRecord.parse(record)
    this.records = this.records.filter(
      (existing) => !(existing.commitSha === parsed.commitSha && existing.role === parsed.role),
    )
    this.records.push(parsed)
  }

  forSha(commitSha: string): ApprovalRecord[] {
    return this.records.filter((record) => record.commitSha === commitSha)
  }

  save(file: string): void {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ records: this.records }, null, 2) + "\n")
  }

  static load(file: string): ApprovalStore {
    try {
      const parsed = ApprovalFile.safeParse(JSON.parse(readFileSync(file, "utf8")))
      if (!parsed.success) throw new HarnessError("C18", parsed.error.message)
      return new ApprovalStore(parsed.data.records)
    } catch (error) {
      if (isNotFound(error)) return new ApprovalStore()
      throw error
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  )
}
