import { readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "yaml"
import { z } from "zod"
import { HarnessError } from "./errors.ts"
import { PageRef } from "./schema.ts"

const Term = z
  .object({
    label: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    relatedPage: PageRef.optional(),
  })
  .strict()

const TermMap = z.record(Term).default({})

export const TaxonomySchema = z
  .object({
    components: TermMap,
    materials: TermMap,
    methods: TermMap,
    purposes: TermMap,
    industries: TermMap,
  })
  .strict()

const ClaimEntry = z
  .object({
    text: z.string().min(1),
    verifiedBy: z.string().min(1),
    verifiedAt: z.string().min(1),
  })
  .strict()

const VerifiedClaim = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1),
    scope: z.string().min(1),
    conditions: z.string().min(1),
    notFor: z.array(z.string()).default([]),
    approvedExpressions: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    verifiedBy: z.string().min(1),
    verifiedAt: z.string().min(1),
    reviewAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()

const RecipeSchema = z
  .object({
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    executor: z.enum(["structured", "agent"]),
    enabled: z.boolean(),
    output: z.string().optional(),
    may_edit: z.array(z.string()).optional(),
    also_may_edit: z.array(z.string()).default([]),
    technical_review: z.boolean().optional(),
    outline_approval: z.boolean().optional(),
  })
  .strict()

const SitebotFile = z
  .object({
    framework: z.string(),
    commands: z
      .object({
        install: z.string(),
        build: z.string(),
        check: z.array(z.string()),
      })
      .strict(),
    preview: z.string(),
    site_admins: z.array(z.string().min(1)).min(1),
    allowed_paths: z.array(z.string()).min(1),
    forbidden_paths: z.array(z.string()).min(1),
    recipes: z
      .object({
        text_edit: RecipeSchema,
        achievement: RecipeSchema,
        column: RecipeSchema,
      })
      .strict(),
  })
  .strict()

const PageIndexEntry = z
  .object({
    kind: z.enum(["achievement", "column", "static"]),
    slug: z.string().min(1),
    title: z.string().min(1),
  })
  .strict()

export type Taxonomy = z.infer<typeof TaxonomySchema>
export type VerifiedClaim = z.infer<typeof VerifiedClaim>
export type CatalogClaim = { id: string; text: string }
export type PageIndexEntry = z.infer<typeof PageIndexEntry>

export type RecipeConfig = {
  tier: 1 | 2 | 3
  executor: "structured" | "agent"
  enabled: boolean
  output?: string
  mayEdit: string[]
  alsoMayEdit: string[]
  technicalReview: boolean
  outlineApproval: boolean
}

export type SitePack = {
  siteAdmins: string[]
  allowedPaths: string[]
  forbiddenPaths: string[]
  recipes: {
    text_edit: RecipeConfig
    achievement: RecipeConfig
    column: RecipeConfig
  }
  claims: CatalogClaim[]
  taxonomy: Taxonomy
  verifiedClaims: VerifiedClaim[]
  pages: PageIndexEntry[]
  styleExcerpt: string
}

export function loadSitePack(root: string): SitePack {
  const config = parseYaml(path.join(root, "sitebot.yaml"), SitebotFile, "sitebot.yaml")
  const claimsFile = parseYaml(
    path.join(root, "content/claims.yaml"),
    z.record(ClaimEntry),
    "content/claims.yaml",
  )
  const taxonomy = parseYaml(
    path.join(root, "content/taxonomy.yaml"),
    TaxonomySchema,
    "content/taxonomy.yaml",
  )
  const verifiedClaims = parseYaml(
    path.join(root, "knowledge/verified-claims.yaml"),
    z.array(VerifiedClaim),
    "knowledge/verified-claims.yaml",
  )
  const pages = parseJson(
    path.join(root, "content/pages.json"),
    z.array(PageIndexEntry),
    "content/pages.json",
  )
  const styleExcerpt = readFileSync(path.join(root, "content/style.md"), "utf8").trim()

  return {
    siteAdmins: config.site_admins,
    allowedPaths: config.allowed_paths,
    forbiddenPaths: config.forbidden_paths,
    recipes: {
      text_edit: toRecipe(config.recipes.text_edit),
      achievement: toRecipe(config.recipes.achievement),
      column: toRecipe(config.recipes.column),
    },
    claims: Object.entries(claimsFile).map(([id, entry]) => ({ id, text: entry.text })),
    taxonomy,
    verifiedClaims,
    pages,
    styleExcerpt,
  }
}

export function selectVerifiedClaims(claims: VerifiedClaim[], today: string): VerifiedClaim[] {
  return claims.filter((claim) => claim.reviewAfter >= today)
}

export function termLabel(taxonomy: Taxonomy, group: keyof Taxonomy, id: string): string {
  const table = taxonomy[group]
  const term = table[id]
  if (!term) throw new HarnessError("C05", `unknown term ${group}.${id}`)
  return term.label
}

function toRecipe(recipe: z.infer<typeof RecipeSchema>): RecipeConfig {
  return {
    tier: recipe.tier,
    executor: recipe.executor,
    enabled: recipe.enabled,
    output: recipe.output,
    mayEdit: recipe.may_edit ?? [],
    alsoMayEdit: recipe.also_may_edit,
    technicalReview: recipe.technical_review ?? false,
    outlineApproval: recipe.outline_approval ?? false,
  }
}

function parseYaml<S extends z.ZodTypeAny>(file: string, schema: S, label: string): z.output<S> {
  const raw = parse(readFileSync(file, "utf8"))
  const result = schema.safeParse(raw)
  if (!result.success) throw new HarnessError("C05", `${label} ${result.error.message}`)
  return result.data
}

function parseJson<S extends z.ZodTypeAny>(file: string, schema: S, label: string): z.output<S> {
  const result = schema.safeParse(JSON.parse(readFileSync(file, "utf8")))
  if (!result.success) throw new HarnessError("C05", `${label} ${result.error.message}`)
  return result.data
}
