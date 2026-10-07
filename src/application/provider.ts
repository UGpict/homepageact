import { createHash } from "node:crypto"
import type { GenerationPayload } from "../payload.ts"
import type { AchievementFacts } from "../schema.ts"

/** Harnessの `generate` 注入点に渡す、差し替え可能な文章作成役。 */
export interface GenerationProvider {
  readonly name: string
  generate(payload: GenerationPayload): Promise<unknown>
}

export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): GenerationProvider {
  if (env.SITEBOT_PROVIDER === "http") {
    const url = env.SITEBOT_GENERATION_URL?.trim()
    if (!url) {
      throw new Error("SITEBOT_GENERATION_URL is required when SITEBOT_PROVIDER=http")
    }
    return httpGenerationProvider({
      url,
      apiKey: env.SITEBOT_GENERATION_API_KEY,
    })
  }
  return mockAchievementProvider()
}

/**
 * APIキーが無い環境用。入力された工程だけから下書きを作る。
 * 主張は常に未確認のまま返し、技術確認は自動で完了しない。
 */
export function mockAchievementProvider(): GenerationProvider {
  return {
    name: "mock",
    async generate(payload) {
      if (payload.recipe !== "achievement" || !payload.facts) {
        throw new Error("mock provider only drafts achievements")
      }
      return mockAchievementOutput(payload.facts)
    },
  }
}

export function httpGenerationProvider(options: {
  url: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): GenerationProvider {
  return {
    name: "http",
    async generate(payload) {
      const headers: Record<string, string> = { "content-type": "application/json" }
      if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`
      const response = await (options.fetchImpl ?? fetch)(options.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ payload }),
      })
      if (!response.ok) {
        throw new Error(`generation provider status ${response.status}`)
      }
      return response.json() as Promise<unknown>
    },
  }
}

export function mockAchievementOutput(facts: AchievementFacts): unknown {
  const digest = createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 8)
  const subject = clip(firstLine(facts.challenge), 48)
  const first = facts.steps[0]
  return {
    slug: `draft-${digest}`,
    title: subject,
    h1: subject,
    shortTitle: clip(subject, 24),
    listingSummary: clip(facts.outcome, 80),
    lead: clip(facts.challenge, 180),
    description: clip(facts.challenge, 120),
    ogImageAlt: facts.images[0]?.memo ?? "実績の画像",
    solutionHeadline: "対応した内容",
    solutionBody: clip(facts.steps.map((step) => firstLine(step.memo)).join("\n"), 180),
    points: facts.steps.map((step) => ({
      stepId: step.id,
      title: clip(firstLine(step.memo), 40),
      blocks: [{ type: "p", text: step.memo }],
    })),
    relatedLinks: [],
    images: facts.images.map((image) => ({
      id: image.id,
      alt: image.memo,
      caption: image.memo,
    })),
    claims: first
      ? [
          {
            id: "needs-technical-review",
            text: `工程の内容を公開してよいか、技術担当者の確認が必要です。${clip(first.memo, 80)}`,
            location: first.id,
            kind: "mechanism",
            source: "ai-general",
          },
        ]
      : [],
  }
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((part) => part.trim())
  return line?.trim() || text.trim()
}

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  let sliced = trimmed.slice(0, max)
  if (/\d$/.test(sliced) && /\d/.test(trimmed.charAt(max))) sliced = sliced.replace(/\d+$/, "")
  return sliced.trim() || trimmed.slice(0, max).trim()
}
