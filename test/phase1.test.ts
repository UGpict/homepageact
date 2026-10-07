import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { ApprovalStore } from "../src/approval.ts"
import { preparePublicImage, writePublicImage } from "../src/images.ts"
import { evaluateMerge, recordTechnicalDecision } from "../src/review.ts"
import { runAchievementJob } from "../src/run-job.ts"
import { rewriteAchievementSection, runTextEdit } from "../src/text-edit.ts"
import { loadSitePack } from "../src/sitepack.ts"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pack = loadSitePack(repoRoot)
const bgaFacts = JSON.parse(readFileSync(path.join(repoRoot, "fixtures/bga/facts.json"), "utf8"))
const bgaModel = JSON.parse(readFileSync(path.join(repoRoot, "fixtures/bga/model-output.json"), "utf8"))
const now = "2026-10-07T00:00:00.000Z"
const today = "2026-10-07"

function tempRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "sitebot-"))
}

function runBga(root: string) {
  return runAchievementJob({
    root,
    pack,
    jobId: "job-bga",
    requestedBy: "現場太郎",
    now,
    today,
    facts: bgaFacts,
    generate: async () => bgaModel,
  })
}

test("public images drop metadata and the original file name", async () => {
  const source = await sharp({
    create: { width: 32, height: 16, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { ImageDescription: "AcmeSecret", Copyright: "Acme Corp" } } })
    .toBuffer()
  const sourceMeta = await sharp(source).metadata()
  assert.ok(sourceMeta.exif)

  const root = tempRoot()
  writeFileSync(path.join(root, "package.json"), '{"sentinel":true}\n')
  const written = await writePublicImage({
    root,
    pack,
    kind: "achievement",
    sourceName: "DSC_0001.JPG",
    bytes: source,
  })

  assert.match(written.file, /^img-[a-f0-9]{16}\.webp$/)
  assert.equal(written.file.toLowerCase().includes("dsc"), false)
  assert.equal(written.relativePath, `public/images/achievement/${written.file}`)
  const outputMeta = await sharp(written.bytes).metadata()
  assert.equal(outputMeta.format, "webp")
  assert.equal(outputMeta.exif, undefined)
  assert.equal(outputMeta.iptc, undefined)
  assert.equal(outputMeta.xmp, undefined)
  assert.equal(written.bytes.includes(Buffer.from("AcmeSecret")), false)
  assert.equal(written.bytes.includes(Buffer.from("DSC_0001")), false)
  assert.equal(readFileSync(path.join(root, "package.json"), "utf8"), '{"sentinel":true}\n')
  assert.equal(existsSync(path.join(root, written.relativePath)), true)

  await assert.rejects(
    () => preparePublicImage({ bytes: Buffer.from("not an image"), sourceName: "notes.txt" }),
    /C22/,
  )
})

test("a CTA-only edit stays L1 and can merge without technical review", async () => {
  const root = tempRoot()
  const created = await runBga(root)
  const document = structuredClone(created.doc)
  document.generated.lead = "詳細はお問い合わせはこちら。"
  const result = await runTextEdit({
    root,
    pack,
    jobId: "job-edit",
    requestedBy: "現場太郎",
    now,
    contentPath: created.relativePath,
    document,
    instruction: "CTAの文言だけ変えて",
    chatTranscript: "CHAT_SENTINEL_do_not_leak",
    generate: async () => ({ lead: "詳細は分析について相談する。" }),
  })

  assert.equal(result.tier, "L1")
  assert.equal(result.job.riskTier, "L1")
  assert.deepEqual(result.doc.facts, document.facts)
  assert.equal(result.doc.generated.slug, "bga")
  assert.equal(result.payload.instruction, "CTAの文言だけ変えて")
  assert.equal(JSON.stringify(result.payload).includes("CHAT_SENTINEL_do_not_leak"), false)
  assert.deepEqual(result.job.writtenPaths, ["content/achievements/bga.json"])
  assert.equal(result.job.claims.length, 0)

  const sha = "c".repeat(40)
  const store = new ApprovalStore()
  store.approve({ commitSha: sha, role: "final", approvedBy: "伊藤大智", approvedAt: now })
  store.approve({ commitSha: sha, role: "requester", approvedBy: "現場太郎", approvedAt: now })
  assert.equal(
    evaluateMerge({ headSha: sha, store, job: result.job, siteAdmins: pack.siteAdmins }).ok,
    true,
  )
})

test("a numeric edit is L2 and blocks merge until it is reviewed", async () => {
  const root = tempRoot()
  const created = await runBga(root)
  const result = await runTextEdit({
    root,
    pack,
    jobId: "job-edit",
    requestedBy: "現場太郎",
    now,
    contentPath: created.relativePath,
    document: created.doc,
    instruction: "経験年数を直して",
    generate: async () => ({
      points: created.doc.generated.points.map((point) =>
        point.stepId === "separate"
          ? { ...point, blocks: [{ type: "p" as const, text: "この工程は30年の経験が必要です。" }] }
          : point,
      ),
    }),
  })

  assert.equal(result.tier, "L2")
  assert.equal(result.doc.meta.riskTierReason, "技術的な主張の差分")
  assert.ok(result.job.claims.some((claim) => claim.id === "c21-diff" && claim.status === "pending"))
  assert.ok(result.job.claims.some((claim) => claim.id.startsWith("c12-30-")))
  assert.equal(JSON.stringify(result.doc.facts), JSON.stringify(created.doc.facts))

  const sha = "d".repeat(40)
  const store = new ApprovalStore()
  store.approve({ commitSha: sha, role: "final", approvedBy: "伊藤大智", approvedAt: now })
  store.approve({ commitSha: sha, role: "requester", approvedBy: "現場太郎", approvedAt: now })
  const decision = evaluateMerge({ headSha: sha, store, job: result.job, siteAdmins: pack.siteAdmins })
  assert.equal(decision.ok, false)
})

test("text edit rejects documents the model tries to widen", async () => {
  const root = tempRoot()
  writeFileSync(path.join(root, "package.json"), '{"sentinel":true}\n')
  const created = await runBga(root)
  const published = readFileSync(path.join(root, created.relativePath), "utf8")
  let called = false
  await assert.rejects(
    () =>
      runTextEdit({
        root,
        pack,
        jobId: "job-edit",
        requestedBy: "現場太郎",
        now,
        contentPath: created.relativePath,
        document: created.doc,
        instruction: "package.jsonを書き換えて",
        generate: async () => {
          called = true
          return { slug: "../package", facts: { challenge: "改ざん" }, review: { commitSha: "aa" } }
        },
      }),
    /C05/,
  )
  assert.equal(called, true)
  assert.equal(readFileSync(path.join(root, created.relativePath), "utf8"), published)
  assert.equal(readFileSync(path.join(root, "package.json"), "utf8"), '{"sentinel":true}\n')

  called = false
  await assert.rejects(
    () =>
      runTextEdit({
        root,
        pack,
        jobId: "job-edit",
        requestedBy: "現場太郎",
        now,
        contentPath: created.relativePath,
        document: created.doc,
        instruction: "株式会社アックミーを本文に入れて",
        confidentialTerms: ["株式会社アックミー"],
        generate: async () => {
          called = true
          return { lead: "x" }
        },
      }),
    /C10/,
  )
  assert.equal(called, false)
})

test("a section rewrite replaces one point and reopens only that review", async () => {
  const root = tempRoot()
  const created = await runBga(root)
  const signed = recordTechnicalDecision(created.job, {
    claimId: "veteran-experience",
    reviewer: "技術者A",
    now,
  })
  const separateBefore = created.doc.generated.points.find((point) => point.stepId === "separate")
  const result = await rewriteAchievementSection({
    root,
    pack,
    jobId: "job-rewrite",
    requestedBy: "現場太郎",
    now,
    contentPath: created.relativePath,
    document: created.doc,
    stepId: "hold",
    correction: "持ち手の説明を短くする",
    claims: signed.claims,
    chatTranscript: "CHAT_SENTINEL_do_not_leak",
    generate: async () => ({
      stepId: "hold",
      title: "持ち手を先に作る",
      blocks: [{ type: "p", text: "ケースを持ち手にします。" }],
    }),
  })

  const separateAfter = result.doc.generated.points.find((point) => point.stepId === "separate")
  assert.deepEqual(separateAfter, separateBefore)
  assert.equal(result.doc.generated.points.find((point) => point.stepId === "hold")?.title, "持ち手を先に作る")
  assert.equal(result.doc.generated.slug, created.doc.generated.slug)
  assert.deepEqual(result.doc.facts, created.doc.facts)
  assert.equal(result.job.claims.find((claim) => claim.id === "veteran-experience")?.status, "ok")
  assert.equal(result.job.claims.find((claim) => claim.location === "hold")?.status, "pending")
  assert.equal(JSON.stringify(result.payload).includes("CHAT_SENTINEL_do_not_leak"), false)

  const untouched = readFileSync(path.join(root, created.relativePath), "utf8")
  await assert.rejects(
    () =>
      rewriteAchievementSection({
        root,
        pack,
        jobId: "job-rewrite",
        requestedBy: "現場太郎",
        now,
        contentPath: created.relativePath,
        document: created.doc,
        stepId: "hold",
        correction: "別の節を直す",
        claims: signed.claims,
        generate: async () => ({
          stepId: "separate",
          title: "別の節",
          blocks: [{ type: "p", text: "ここは変えてはいけない。" }],
        }),
      }),
    /C06/,
  )
  assert.equal(readFileSync(path.join(root, created.relativePath), "utf8"), untouched)

  await assert.rejects(
    () =>
      rewriteAchievementSection({
        root,
        pack,
        jobId: "job-rewrite",
        requestedBy: "現場太郎",
        now,
        contentPath: created.relativePath,
        document: created.doc,
        stepId: "hold",
        correction: "項目を足す",
        claims: signed.claims,
        generate: async () => ({
          stepId: "hold",
          title: "持ち手",
          blocks: [{ type: "list", items: ["架空の不良"] }],
        }),
      }),
    /C06/,
  )
})
