import { z } from "zod"
import type { PublicAchievement } from "./schema.ts"

export const metadataFields = ["title", "h1", "description"] as const
export const MetadataPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  h1: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(500).optional(),
}).strict().refine(v => Object.keys(v).length > 0, "修正案を1つ以上記入してください。")
export function metadataChanges(before: PublicAchievement, after: PublicAchievement) {
  return metadataFields.filter(field => before.generated[field] !== after.generated[field])
    .map(field => ({ field, before: before.generated[field], after: after.generated[field] }))
}
export function applyMetadataProposal(original: PublicAchievement, input: unknown): PublicAchievement {
  const proposal = MetadataPatchSchema.parse(input)
  return { ...original, generated: { ...original.generated, ...proposal } }
}
