import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import {
  buildAchievementFacts,
  createAchievementDraft,
  getJob,
  harnessErrorToHuman,
  httpGenerationProvider,
  mockAchievementProvider,
  prepareAchievementImage,
  type AppContext,
  type GenerationProvider,
} from "../src/application/index.ts"
import { HarnessError } from "../src/errors.ts"
import { AchievementFacts } from "../src/schema.ts"
import { loadSitePack } from "../src/sitepack.ts"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pack = loadSitePack(repoRoot)
const user = { id: "dev-requester", displayName: "開発用ユーザー", roles: ["requester"] as const }
const now = "2026-10-07T00:00:00.000Z"

function dataRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "sitebot-app-"))
}

function ctx(root: string, provider: GenerationProvider, confidentialTerms: string[] = []): AppContext {
  return {
    packRoot: repoRoot,
    dataRoot: root,
    user: { ...user, roles: [...user.roles] },
    provider,
    confidentialTerms,
    now,
    today: "2026-10-07",
  }
}

async function upload(root: string, provider: GenerationProvider = mockAchievementProvider()) {
  const bytes = await sharp({
    create: { width: 24, height: 16, channels: 3, background: { r: 20, g: 40, b: 80 } },
  })
    .jpeg()
    .toBuffer()
  const saved = await prepareAchievementImage(ctx(root, provider), {
    bytes,
    sourceName: "secret-customer-photo.jpg",
  })
  assert.equal(saved.ok, true)
  if (!saved.ok) throw new Error("upload failed")
  assert.match(saved.upload.file, /^img-[a-f0-9]{16}\.webp$/)
  assert.equal(saved.upload.file.includes("secret"), false)
  return saved.upload
}

function form(uploadId: string, patch: Record<string, unknown> = {}) {
  return {
    challenge: "アンダーフィルがあるため、加熱だけでは安全に外せない。",
    clientPurpose: "基板を傷めずに部品を単体化したい。",
    workContext: "customer",
    outcome: "電気特性を保ったまま単体化できた。",
    scopeNotes: ["サイズによっては対応できない。"],
    tags: {
      components: ["semiconductor", "bga"],
      materials: [],
      methods: ["underfill-removal"],
      purposes: [],
      industries: [],
    },
    steps: [
      {
        summary: "ケースを固定して研磨の持ち手にする。",
        detail: "接着剤でケースを固定する。",
        items: ["ケースを装着する"],
        formulas: [],
        scopeNotes: [],
        imageIds: [],
      },
      {
        summary: "基板側から分離する。",
        detail: "底面の配線と樹脂を除去する。",
        items: [],
        formulas: [{ text: "除去量 = 厚み - 残厚" }],
        scopeNotes: ["構造によっては不可。"],
        imageIds: [uploadId],
      },
    ],
    images: [
      {
        uploadId,
        memo: "分離後の底面",
        depicts: "actual",
        scaleBars: [],
        clearance: {
          noCustomerName: true,
          noPartOrLotNumber: true,
          noLogo: true,
          noOtherConfidential: true,
        },
      },
    ],
    ...patch,
  }
}

test("form input becomes AchievementFacts without client paths or step ids", async () => {
  const root = dataRoot()
  const image = await upload(root)
  const built = buildAchievementFacts(form(image.id), {
    taxonomy: pack.taxonomy,
    user: { ...user, roles: [...user.roles] },
    now,
    lookupUpload: () => ({ id: image.id, file: image.file }),
  })
  assert.equal(built.ok, true)
  if (!built.ok) return
  const facts = AchievementFacts.parse(built.facts)
  assert.deepEqual(facts.steps.map((step) => step.id), ["step-1", "step-2"])
  assert.equal(facts.images[0]?.file, image.file)
  assert.equal(facts.images[0]?.clearance.checkedBy, "開発用ユーザー")
  assert.equal(JSON.stringify(facts).includes("secret-customer"), false)
  assert.equal("outputPath" in facts, false)
})

test("invalid forms are rejected before generation", async () => {
  const root = dataRoot()
  const image = await upload(root)
  let calls = 0
  const provider: GenerationProvider = {
    name: "spy",
    async generate() {
      calls += 1
      return {}
    },
  }
  const oneStep = form(image.id)
  oneStep.steps = [oneStep.steps[0]].filter((step) => step !== undefined)
  const tooFew = await createAchievementDraft(ctx(root, provider), oneStep)
  assert.equal(tooFew.ok, false)
  if (!tooFew.ok) assert.match(tooFew.error.message, /2件以上/)

  const unknown = await createAchievementDraft(
    ctx(root, provider),
    form(image.id, { tags: { ...form(image.id).tags, components: ["not-a-real-term"] } }),
  )
  assert.equal(unknown.ok, false)
  if (!unknown.ok) assert.match(unknown.error.message, /一覧にない分類/)

  const cleared = form(image.id)
  const imageInput = cleared.images[0]
  if (!imageInput) throw new Error("missing image")
  imageInput.clearance = { ...imageInput.clearance, noLogo: false }
  const blocked = await createAchievementDraft(ctx(root, provider), cleared)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) {
    assert.match(blocked.error.message, /確認/)
    assert.equal(blocked.error.field, "clearance")
  }

  const pathed = await createAchievementDraft(ctx(root, provider), {
    ...form(image.id),
    outputPath: "../package.json",
    root: "/tmp",
  })
  assert.equal(pathed.ok, false)
  if (!pathed.ok) assert.match(pathed.error.title, /送信できない項目/)
  assert.equal(calls, 0)
})

test("mock draft stays in technical review and does not approve claims", async () => {
  const root = dataRoot()
  const image = await upload(root)
  let sawConfidential = false
  const provider: GenerationProvider = {
    name: "mock-spy",
    async generate(payload) {
      sawConfidential = "confidentialTerms" in payload || "chatTranscript" in payload
      return mockAchievementProvider().generate(payload)
    },
  }
  const draft = await createAchievementDraft(ctx(root, provider), form(image.id))
  assert.equal(draft.ok, true)
  if (!draft.ok) return
  assert.equal(sawConfidential, false)
  assert.equal(draft.job.phase, "TECHNICAL_REVIEW")
  assert.equal(draft.job.phaseLabel, "技術確認待ち")
  assert.ok(draft.job.pendingCount >= 1)
  assert.equal(draft.job.requestedBy, "dev-requester")
  assert.match(draft.job.preview.heading, /アンダーフィル/)
  assert.ok(draft.job.preview.sections.length >= 2)
  assert.equal(
    draft.job.claims.every((claim) => claim.statusLabel === "確認待ち" && claim.detail.status === "pending"),
    true,
  )
  const visible = draft.job.claims.map((claim) => `${claim.headline}\n${claim.quotation}\n${claim.explanation}`).join("\n")
  assert.doesNotMatch(visible, /C\d+|HarnessError|facts \/ brief/)
  assert.match(draft.job.claims[0]?.explanation ?? "", /技術担当者/)

  const saved = getJob(ctx(root, provider), draft.job.jobId)
  assert.equal(saved?.phase, "TECHNICAL_REVIEW")
  const files = readdirSync(path.join(root, "content/achievements"))
  assert.equal(files.length, 1)
  const doc = JSON.parse(readFileSync(path.join(root, "content/achievements", files[0] ?? ""), "utf8"))
  assert.equal(doc.meta.requestedBy, "dev-requester")
  assert.equal(doc.review, undefined)
  assert.equal(doc.commitSha, undefined)
  assert.equal(doc.generated.claims, undefined)
  assert.equal(doc.facts.steps[0]?.id, "step-1")
})

test("unsourced numbers are shown as pending technical checks", async () => {
  const root = dataRoot()
  const image = await upload(root)
  const provider: GenerationProvider = {
    name: "number",
    async generate(payload) {
      const output = await mockAchievementProvider().generate(payload)
      if (!output || typeof output !== "object") return output
      return { ...output, lead: "隙間は 30 でした" }
    },
  }
  const draft = await createAchievementDraft(ctx(root, provider), form(image.id))
  assert.equal(draft.ok, true)
  if (!draft.ok) return
  const numeric = draft.job.claims.find((claim) => claim.detail.id.startsWith("c12-"))
  assert.ok(numeric)
  assert.match(numeric?.headline ?? "", /数値 30 の出典が確認できません/)
  assert.equal(numeric?.statusLabel, "確認待ち")
  assert.equal(numeric?.locationLabel, "本文")
  assert.doesNotMatch(`${numeric?.headline}${numeric?.explanation}`, /C12|c12-/)
  assert.match(numeric?.detail.id ?? "", /^c12-/)
})

test("confidential input becomes a human error and does not call the model", async () => {
  const root = dataRoot()
  const image = await upload(root)
  let calls = 0
  const provider: GenerationProvider = {
    name: "spy",
    async generate() {
      calls += 1
      return {}
    },
  }
  const draft = await createAchievementDraft(ctx(root, provider, ["株式会社アックミー"]), form(image.id, {
    challenge: "株式会社アックミーの基板を外したい。",
  }))
  assert.equal(calls, 0)
  assert.equal(draft.ok, false)
  if (draft.ok) return
  assert.match(draft.error.title, /公開できない情報/)
  assert.match(draft.error.message, /機密情報/)
  assert.match(draft.error.next, /修正/)
  assert.match(draft.error.detail ?? "", /C10/)
  assert.doesNotMatch(`${draft.error.title}${draft.error.message}${draft.error.next}`, /C10|HarnessError/)
  assert.equal(readdirSync(root).includes("content"), false)
})

test("harness errors keep their code in the developer detail only", () => {
  const human = harnessErrorToHuman(new HarnessError("C20", "claim location is not a step or image: body"))
  assert.match(human.title, /確認/)
  assert.match(human.next, /もう一度/)
  assert.match(human.detail ?? "", /C20/)
  assert.doesNotMatch(`${human.title}${human.message}${human.next}`, /C20|HarnessError/)
})

test("http provider sends the key in the header and still returns harness-checked json", async () => {
  const root = dataRoot()
  const image = await upload(root)
  let authorization = ""
  let body = ""
  const provider = httpGenerationProvider({
    url: "https://llm.example/generate",
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? ""
      body = String(init?.body)
      const payload = JSON.parse(body).payload
      return new Response(JSON.stringify(await mockAchievementProvider().generate(payload)), { status: 200 })
    },
  })
  const draft = await createAchievementDraft(ctx(root, provider), form(image.id))
  assert.equal(draft.ok, true)
  assert.equal(authorization, "Bearer test-key")
  assert.equal(body.includes("test-key"), false)
})
