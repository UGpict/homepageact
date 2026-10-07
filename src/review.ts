import { createHash } from "node:crypto"
import { HarnessError } from "./errors.ts"
import type { ApprovalStore } from "./approval.ts"

export type JobClaim = {
  id: string
  text: string
  location: string
  kind:
    | "number"
    | "mechanism"
    | "standard"
    | "comparison"
    | "house-stance"
    | "caption"
    | "other"
  source: "facts" | "brief" | "claims" | "verified" | "ai-general"
  sourceRef?: string
  status: "pending" | "ok"
  reviewer?: string
  textHash?: string
  decidedAt?: string
}

export type JobRecord = {
  jobId: string
  recipe: "achievement" | "column" | "text_edit"
  requestedBy: string
  contentPath: string
  claims: JobClaim[]
  writtenPaths: string[]
  /** L1 は技術確認を要求しない。主張が1件でもあれば、その確認はどちらでも必須。 */
  riskTier: "L1" | "L2"
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** 確認済み知識の文言一致では ok にしない。レビューアの操作だけが ok にする。 */
export function recordTechnicalDecision(
  job: JobRecord,
  input: { claimId: string; reviewer: string; now: string },
): JobRecord {
  if (input.reviewer === job.requestedBy) {
    throw new HarnessError("C17", "requester cannot be the technical reviewer")
  }
  let found = false
  const claims = job.claims.map((claim) => {
    if (claim.id !== input.claimId) return claim
    found = true
    return {
      ...claim,
      status: "ok" as const,
      reviewer: input.reviewer,
      textHash: hashText(claim.text),
      decidedAt: input.now,
    }
  })
  if (!found) throw new HarnessError("C17", `unknown claim ${input.claimId}`)
  return { ...job, claims }
}

/** セクションが1バイトでも変わったら、その location の主張を全部 pending に戻す。 */
export function invalidateLocation(job: JobRecord, location: string): JobRecord {
  return {
    ...job,
    claims: job.claims.map((claim) => {
      if (claim.location !== location) return claim
      return {
        id: claim.id,
        text: claim.text,
        location: claim.location,
        kind: claim.kind,
        source: claim.source,
        sourceRef: claim.sourceRef,
        status: "pending" as const,
      }
    }),
  }
}

export function evaluateMerge(input: {
  headSha: string
  store: ApprovalStore
  job: JobRecord
  siteAdmins: string[]
}): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  const records = input.store.forSha(input.headSha)
  const finalApproval = records.find((record) => record.role === "final")
  const requesterApproval = records.find((record) => record.role === "requester")

  if (!finalApproval) failures.push("C18: final approval for HEAD is missing")
  else if (!input.siteAdmins.includes(finalApproval.approvedBy)) {
    failures.push("C18: final approver is not a site admin")
  }

  if (!requesterApproval) failures.push("C18: requester approval for HEAD is missing")
  else if (requesterApproval.approvedBy !== input.job.requestedBy) {
    failures.push("C18: requester approval is not from the requester")
  }

  if (input.job.riskTier === "L2" && input.job.claims.length === 0) {
    failures.push("C17: no technical claims to review")
  }

  for (const claim of input.job.claims) {
    if (claim.status !== "ok") {
      failures.push(`C17: ${claim.id} is ${claim.status}`)
      continue
    }
    if (claim.textHash !== hashText(claim.text)) {
      failures.push(`C17: ${claim.id} hash mismatch`)
    }
    if (!claim.reviewer || claim.reviewer === input.job.requestedBy) {
      failures.push(`C17: ${claim.id} reviewer is missing or is the requester`)
    }
  }

  return { ok: failures.length === 0, failures }
}
