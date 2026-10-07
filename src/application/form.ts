import { z } from "zod"
import type { Taxonomy } from "../sitepack.ts"
import { AchievementFacts, type AchievementFacts as Facts } from "../schema.ts"
import { inputError } from "./errors.ts"
import type { CurrentUser, HumanError, TagGroup } from "./types.ts"

const TAG_GROUPS = ["components", "materials", "methods", "purposes", "industries"] as const

const FORBIDDEN_KEYS = [
  "root",
  "outputPath",
  "path",
  "contentPath",
  "repo",
  "repository",
  "requestedBy",
  "checkedBy",
  "checkedAt",
  "slug",
  "writePath",
  "file",
] as const

const ClearanceFlags = z
  .object({
    noCustomerName: z.boolean(),
    noPartOrLotNumber: z.boolean(),
    noLogo: z.boolean(),
    noOtherConfidential: z.boolean(),
  })
  .strict()

const FormImage = z
  .object({
    uploadId: z.string().regex(/^photo-[a-f0-9]{8}$/),
    memo: z.string().trim().min(1).max(4000),
    depicts: z.enum(["actual", "substitute", "diagram"]),
    substituteNote: z.string().trim().max(4000).optional(),
    scaleBars: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
    legend: z.string().trim().max(4000).optional(),
    clearance: ClearanceFlags,
  })
  .strict()

const FormStep = z
  .object({
    summary: z.string().trim().min(1).max(4000),
    detail: z.string().trim().max(8000).optional(),
    items: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
    formulas: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(2000),
            note: z.string().trim().min(1).max(2000).optional(),
          })
          .strict(),
      )
      .max(6)
      .default([]),
    scopeNotes: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
    imageIds: z.array(z.string()).max(3).default([]),
  })
  .strict()

const FormOrigin = z
  .object({
    year: z.number().int().min(1980).max(2100).optional(),
    industry: z.string().trim().min(1),
    request: z.string().trim().min(1).max(4000),
    ongoing: z.boolean().default(false),
  })
  .strict()

export const AchievementForm = z
  .object({
    challenge: z.string().trim().min(1).max(8000),
    clientPurpose: z.string().trim().max(4000).optional(),
    workContext: z.enum(["customer", "internal", "partner"]),
    outcome: z.string().trim().min(1).max(8000),
    scopeNotes: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
    tags: z
      .object({
        components: z.array(z.string()).default([]),
        materials: z.array(z.string()).default([]),
        methods: z.array(z.string()).default([]),
        purposes: z.array(z.string()).default([]),
        industries: z.array(z.string()).default([]),
      })
      .strict(),
    origin: FormOrigin.optional(),
    steps: z.array(FormStep).min(2).max(6),
    images: z.array(FormImage).min(1).max(12),
    heroUploadId: z.string().optional(),
    youtubeId: z.string().trim().optional(),
  })
  .strict()

export type AchievementForm = z.infer<typeof AchievementForm>

type UploadRef = { id: string; file: string }

export function buildAchievementFacts(
  input: unknown,
  deps: {
    taxonomy: Taxonomy
    user: CurrentUser
    now: string
    lookupUpload: (id: string) => UploadRef | undefined
  },
): { ok: true; facts: Facts } | { ok: false; error: HumanError } {
  const forbidden = forbiddenKey(input)
  if (forbidden) {
    return {
      ok: false,
      error: inputError(
        "送信できない項目が含まれています",
        "保存先や依頼者は、この画面からは指定できません。",
        "表示されている項目だけを入力して、もう一度下書きを作成してください。",
        undefined,
        `rejected key ${forbidden}`,
      ),
    }
  }

  const parsed = AchievementForm.safeParse(blankToUndefined(input))
  if (!parsed.success) {
    return { ok: false, error: formIssue(parsed.error) }
  }
  const form = parsed.data

  if (form.youtubeId && !/^[A-Za-z0-9_-]{11}$/.test(form.youtubeId)) {
    return {
      ok: false,
      error: inputError(
        "動画IDを確認してください",
        "動画IDは11文字で入力してください。空欄のままでも下書きを作成できます。",
        "動画IDを空欄にするか、正しいIDに直してください。",
        "youtubeId",
      ),
    }
  }

  for (const group of TAG_GROUPS) {
    for (const id of form.tags[group]) {
      if (!deps.taxonomy[group][id]) {
        return {
          ok: false,
          error: inputError(
            "分類を選び直してください",
            "一覧にない分類は使えません。",
            "表示されている分類から選び直してください。",
            `tags.${group}`,
            `unknown term ${group}.${id}`,
          ),
        }
      }
    }
  }

  if (form.origin && !deps.taxonomy.industries[form.origin.industry]) {
    return {
      ok: false,
      error: inputError(
        "業種を選び直してください",
        "一覧にない業種は使えません。",
        "表示されている業種から選んでください。",
        "origin.industry",
      ),
    }
  }

  const uploads = new Map<string, UploadRef>()
  for (const image of form.images) {
    if (uploads.has(image.uploadId)) {
      return {
        ok: false,
        error: inputError(
          "同じ画像が重複しています",
          "1枚の画像は一度だけ追加してください。",
          "重複した画像を削除してください。",
          "images",
        ),
      }
    }
    const stored = deps.lookupUpload(image.uploadId)
    if (!stored || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/.test(stored.file)) {
      return {
        ok: false,
        error: inputError(
          "画像が見つかりません",
          "アップロードした画像を確認できませんでした。",
          "画像をもう一度アップロードしてください。",
          "images",
        ),
      }
    }
    const flags = image.clearance
    if (!flags.noCustomerName || !flags.noPartOrLotNumber || !flags.noLogo || !flags.noOtherConfidential) {
      return {
        ok: false,
        error: inputError(
          "画像の確認が終わっていません",
          "顧客名・部品番号・ロゴ・その他の機密情報が写っていないことを、すべて確認してください。",
          "4つの確認項目にチェックを入れてから、下書きを作成してください。",
          "clearance",
        ),
      }
    }
    if (image.depicts === "substitute" && !image.substituteNote) {
      return {
        ok: false,
        error: inputError(
          "代替画像の説明が必要です",
          "実物ではない画像には、代わりに何を写しているかを書いてください。",
          "代替である理由を入力してください。",
          "substituteNote",
        ),
      }
    }
    uploads.set(image.uploadId, stored)
  }

  for (const [index, step] of form.steps.entries()) {
    for (const imageId of step.imageIds) {
      if (!uploads.has(imageId)) {
        return {
          ok: false,
          error: inputError(
            "工程の画像を確認してください",
            `工程 ${index + 1} に、追加していない画像が選ばれています。`,
            "使用画像を選び直してください。",
            `steps.${index}.imageIds`,
          ),
        }
      }
    }
  }

  if (form.heroUploadId && !uploads.has(form.heroUploadId)) {
    return {
      ok: false,
      error: inputError(
        "代表画像を確認してください",
        "追加した画像の中から代表画像を選んでください。",
        "代表画像を選び直すか、未選択のままにしてください。",
        "heroUploadId",
      ),
    }
  }

  const factsInput = {
    tags: form.tags,
    workContext: form.workContext,
    challenge: form.challenge,
    clientPurpose: form.clientPurpose,
    origin: form.origin,
    steps: form.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      memo: [step.summary, step.detail].filter(Boolean).join("\n"),
      items: step.items,
      formulas: step.formulas,
      scopeNotes: step.scopeNotes,
      images: step.imageIds,
    })),
    outcome: form.outcome,
    scopeNotes: form.scopeNotes,
    images: form.images.map((image) => {
      const stored = uploads.get(image.uploadId)
      return {
        id: image.uploadId,
        file: stored?.file,
        memo: image.memo,
        depicts: image.depicts,
        substituteNote: image.depicts === "substitute" ? image.substituteNote : undefined,
        scaleBars: image.scaleBars,
        legend: image.legend,
        clearance: {
          noCustomerName: true as const,
          noPartOrLotNumber: true as const,
          noLogo: true as const,
          noOtherConfidential: true as const,
          checkedBy: deps.user.displayName,
          checkedAt: deps.now,
        },
      }
    }),
    heroImage: form.heroUploadId,
    youtubeId: form.youtubeId,
  }

  const facts = AchievementFacts.safeParse(factsInput)
  if (!facts.success) {
    return {
      ok: false,
      error: inputError(
        "入力内容を確認してください",
        "必要な項目が、サイトのルールと合っていません。",
        "未入力の項目を埋めて、もう一度下書きを作成してください。",
        undefined,
        facts.error.message,
      ),
    }
  }
  return { ok: true, facts: facts.data }
}

function forbiddenKey(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined
  return FORBIDDEN_KEYS.find((key) => key in input)
}

function blankToUndefined(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input
      .map(blankToUndefined)
      .filter((item) => !(typeof item === "string" && item.trim() === ""))
  }
  if (!input || typeof input !== "object") return input
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim() === "" && key !== "challenge" && key !== "outcome") {
      continue
    }
    result[key] = blankToUndefined(value)
  }
  return result
}

function formIssue(error: z.ZodError): HumanError {
  const issue = error.issues[0]
  const path = issue?.path.join(".") ?? ""
  if (path === "steps" || path.startsWith("steps")) {
    const tooFew = issue?.code === "too_small"
    const tooMany = issue?.code === "too_big"
    if (tooFew || tooMany) {
      return inputError(
        "工程の件数を確認してください",
        tooMany ? "工程は6件までです。" : "工程は2件以上必要です。",
        "工程を2件から6件の範囲で入力してください。",
        "steps",
        error.message,
      )
    }
  }
  if (path.startsWith("images") && issue?.code === "too_small") {
    return inputError(
      "画像を追加してください",
      "実績には写真が1枚以上必要です。",
      "画像をアップロードしてから、下書きを作成してください。",
      "images",
      error.message,
    )
  }
  if (!issue) {
    return inputError(
      "入力内容を確認してください",
      "必要な項目が不足しているか、形式が正しくありません。",
      "未入力の項目を埋めて、もう一度下書きを作成してください。",
      undefined,
      error.message,
    )
  }
  return inputError(
    "入力内容を確認してください",
    fieldMessage(path, issue.message),
    "該当の項目を修正して、もう一度下書きを作成してください。",
    path || undefined,
    error.message,
  )
}

function fieldMessage(path: string, fallback: string): string {
  if (path === "challenge") return "お客様が困っていたことを入力してください。"
  if (path === "outcome") return "結果を入力してください。"
  if (path === "workContext") return "案件の種別を選んでください。"
  if (path.endsWith("summary")) return "工程名または概要を入力してください。"
  if (path.endsWith("memo")) return "画像の説明を入力してください。"
  if (path.includes("clearance")) return "画像の確認項目をすべてチェックしてください。"
  void fallback
  return "必要な項目が不足しているか、形式が正しくありません。"
}

export function tagGroups(): readonly TagGroup[] {
  return TAG_GROUPS
}
