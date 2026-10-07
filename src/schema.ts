import { z } from "zod"

/** モデルが提案できる slug。パス区切りと `..` は通さない。 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const Slug = z.string().regex(SLUG_PATTERN)
export const TermId = Slug
export const StepId = Slug
export const ImageId = Slug
export const PublicImageFile = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/)

export const PageRef = z
  .object({
    kind: z.enum(["achievement", "column", "static"]),
    slug: Slug,
  })
  .strict()

export const RelatedLink = z
  .object({
    ref: PageRef,
    label: z.string().min(1),
    sublabel: z.string().min(1).optional(),
  })
  .strict()

export const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), text: z.string() }).strict(),
  z.object({ type: z.literal("list"), items: z.array(z.string()) }).strict(),
  z
    .object({
      type: z.literal("table"),
      head: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .strict(),
  z.object({ type: z.literal("image"), ref: ImageId }).strict(),
  z
    .object({
      type: z.literal("formula"),
      text: z.string().min(1),
      note: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal("link"), ref: PageRef, label: z.string().min(1) }).strict(),
])

export const Faq = z
  .object({
    q: z.string().min(1),
    a: z.string().min(1),
  })
  .strict()

const TermList = z.array(TermId).default([])

export const Tags = z
  .object({
    components: TermList,
    materials: TermList,
    methods: TermList,
    purposes: TermList,
    industries: TermList,
  })
  .strict()

export const Clearance = z
  .object({
    noCustomerName: z.literal(true),
    noPartOrLotNumber: z.literal(true),
    noLogo: z.literal(true),
    noOtherConfidential: z.literal(true),
    checkedBy: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .strict()

/** 人間とハーネスが書く画像事実。alt / caption はここには置かない。 */
export const ImageFact = z
  .object({
    id: ImageId,
    file: PublicImageFile,
    memo: z.string().min(1),
    depicts: z.enum(["actual", "substitute", "diagram"]),
    substituteNote: z.string().min(1).optional(),
    scaleBars: z.array(z.string().min(1)).default([]),
    legend: z.string().min(1).optional(),
    clearance: Clearance,
  })
  .strict()
  .superRefine((image, ctx) => {
    if (image.depicts === "substitute" && !image.substituteNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "substitute の画像には substituteNote が必須",
      })
    }
  })

export const FormulaFact = z
  .object({
    text: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .strict()

export const AchievementStep = z
  .object({
    id: StepId,
    memo: z.string().min(1),
    items: z.array(z.string().min(1)).default([]),
    formulas: z.array(FormulaFact).default([]),
    scopeNotes: z.array(z.string().min(1)).default([]),
    images: z.array(ImageId).max(3),
  })
  .strict()

export const AchievementFacts = z
  .object({
    tags: Tags,
    workContext: z.enum(["customer", "internal", "partner"]).default("customer"),
    challenge: z.string().min(1),
    clientPurpose: z.string().min(1).optional(),
    origin: z
      .object({
        year: z.number().int().optional(),
        industry: TermId,
        request: z.string().min(1),
        ongoing: z.boolean().default(false),
      })
      .strict()
      .optional(),
    steps: z.array(AchievementStep).min(2).max(6),
    outcome: z.string().min(1),
    scopeNotes: z.array(z.string().min(1)).default([]),
    claimIds: z.array(z.string().min(1)).default([]),
    images: z.array(ImageFact).min(1),
    heroImage: ImageId.optional(),
    youtubeId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{11}$/)
      .optional(),
  })
  .strict()

export const ClaimKind = z.enum([
  "number",
  "mechanism",
  "standard",
  "comparison",
  "house-stance",
  "caption",
  "other",
])

export const ClaimSource = z.enum(["facts", "brief", "claims", "verified", "ai-general"])

/** モデルが返してよい主張の下書き。status / reviewer / commitSha は無い。 */
export const ClaimDraft = z
  .object({
    id: Slug,
    text: z.string().min(1),
    location: z.string().min(1),
    kind: ClaimKind,
    source: ClaimSource,
    sourceRef: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.source === "ai-general" && claim.sourceRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ai-general に sourceRef は付けない",
      })
    }
    if (claim.source !== "ai-general" && !claim.sourceRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ai-general 以外の主張には sourceRef が必須",
      })
    }
  })

const ImageCopy = z
  .object({
    id: ImageId,
    alt: z.string().min(1),
    caption: z.string().min(1),
  })
  .strict()

/**
 * 実績の生成APIが返してよいJSON。
 * facts / review / meta / clearance / 書き込み先パスは含めない。
 */
export const AchievementModelOutput = z
  .object({
    slug: Slug,
    title: z.string().min(1),
    h1: z.string().min(1),
    shortTitle: z.string().min(1),
    listingSummary: z.string().min(1),
    lead: z.string().min(1),
    description: z.string().min(1),
    ogImageAlt: z.string().min(1),
    solutionHeadline: z.string().min(1).optional(),
    solutionBody: z.string().min(1).optional(),
    points: z.array(
      z
        .object({
          stepId: StepId,
          title: z.string().min(1),
          blocks: z.array(Block),
        })
        .strict(),
    ),
    relatedLinks: z.array(RelatedLink).max(3),
    faq: z.array(Faq).max(2).optional(),
    images: z.array(ImageCopy),
    claims: z.array(ClaimDraft),
  })
  .strict()

export const HouseStance = z
  .object({
    statement: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict()

export const ColumnBrief = z
  .object({
    targetQuery: z.string().min(1),
    queryVariants: z.array(z.string()).default([]),
    readerSituation: z.string().min(1),
    houseStances: z.array(HouseStance).min(1),
    tags: Tags,
    images: z.array(ImageFact).default([]),
    mustLink: z.array(PageRef).default([]),
    references: z.array(z.string()).default([]),
    claimIds: z.array(z.string()).default([]),
  })
  .strict()

export const OutlineRole = z.enum([
  "definition",
  "mechanism",
  "comparison",
  "conditions",
  "consequences",
  "inspection",
  "next-action",
  "house-method",
  "contact",
])

export const OutlineSection = z
  .object({
    id: Slug,
    heading: z.string().min(1),
    role: OutlineRole,
  })
  .strict()

export const ColumnModelOutput = z
  .object({
    slug: Slug,
    title: z.string().min(1),
    h1: z.string().min(1),
    shortTitle: z.string().min(1),
    listingSummary: z.string().min(1),
    lead: z.string().min(1),
    description: z.string().min(1),
    ogImageAlt: z.string().min(1),
    sections: z.array(
      z
        .object({
          outlineId: Slug,
          blocks: z.array(Block),
        })
        .strict(),
    ),
    relatedLinks: z.array(RelatedLink).max(5),
    faq: z.array(Faq).max(3).optional(),
    images: z.array(ImageCopy).default([]),
    claims: z.array(ClaimDraft),
  })
  .strict()

export const PublicMeta = z
  .object({
    id: z.string().min(1),
    recipe: z.enum(["achievement", "column"]),
    status: z.literal("draft"),
    requestedBy: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    customerDisclosure: z.literal("anonymous"),
    riskTier: z.enum(["L1", "L2"]),
    riskTierReason: z.string().min(1).optional(),
  })
  .strict()

export type PageRef = z.infer<typeof PageRef>
export type Block = z.infer<typeof Block>
export type Tags = z.infer<typeof Tags>
export type ImageFact = z.infer<typeof ImageFact>
export type AchievementFacts = z.infer<typeof AchievementFacts>
export type AchievementModelOutput = z.infer<typeof AchievementModelOutput>
export type ColumnBrief = z.infer<typeof ColumnBrief>
export type OutlineSection = z.infer<typeof OutlineSection>
export type ColumnModelOutput = z.infer<typeof ColumnModelOutput>
export type ClaimDraft = z.infer<typeof ClaimDraft>
export type PublicMeta = z.infer<typeof PublicMeta>

export type AchievementGenerated = Omit<AchievementModelOutput, "claims">
export type ColumnGenerated = Omit<ColumnModelOutput, "claims">

export type PublicAchievement = {
  meta: PublicMeta
  facts: AchievementFacts
  generated: AchievementGenerated
}

export type PublicColumn = {
  meta: PublicMeta
  brief: ColumnBrief
  outline: OutlineSection[]
  generated: ColumnGenerated
}
