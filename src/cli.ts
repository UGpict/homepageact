import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { ApprovalStore } from "./approval.ts"
import { HarnessError } from "./errors.ts"
import { evaluateMerge } from "./review.ts"
import { writePublicImage } from "./images.ts"
import { runAchievementJob } from "./run-job.ts"
import { loadSitePack } from "./sitepack.ts"

const repoRoot = process.cwd()

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  if (command === "run-fixture" && args[0] === "bga") {
    const root = flag(args, "--root") ?? "out"
    const pack = loadSitePack(repoRoot)
    const facts = JSON.parse(readFileSync(path.join(repoRoot, "fixtures/bga/facts.json"), "utf8"))
    const model = JSON.parse(
      readFileSync(path.join(repoRoot, "fixtures/bga/model-output.json"), "utf8"),
    )
    const result = await runAchievementJob({
      root,
      pack,
      jobId: "bga-migration",
      requestedBy: "現場太郎",
      now: "2026-10-07T00:00:00.000Z",
      today: "2026-10-07",
      facts,
      generate: async () => model,
    })
    const previewPath = path.join(root, "preview/bga.txt")
    mkdirSync(path.dirname(previewPath), { recursive: true })
    writeFileSync(previewPath, result.preview + "\n")
    console.log(result.relativePath)
    console.log(previewPath)
    return
  }

  if (command === "prepare-image") {
    const file = required(args, "--file")
    const kind = flag(args, "--kind") ?? "achievement"
    if (kind !== "achievement" && kind !== "column") {
      throw new HarnessError("C22", "kind must be achievement or column")
    }
    const root = flag(args, "--root") ?? "out"
    const written = await writePublicImage({
      root,
      pack: loadSitePack(repoRoot),
      kind,
      sourceName: file,
      bytes: readFileSync(file),
    })
    console.log(written.relativePath)
    return
  }

  if (command === "approve") {
    const root = flag(args, "--root") ?? "out"
    const sha = required(args, "--sha")
    const role = required(args, "--role")
    const by = required(args, "--by")
    if (role !== "final" && role !== "requester") {
      throw new HarnessError("C18", "role must be final or requester")
    }
    const file = path.join(root, ".sitebot/approvals.json")
    const store = ApprovalStore.load(file)
    store.approve({
      commitSha: sha,
      role,
      approvedBy: by,
      approvedAt: new Date().toISOString(),
    })
    store.save(file)
    console.log(`${role} ${sha}`)
    return
  }

  if (command === "can-merge") {
    const root = flag(args, "--root") ?? "out"
    const sha = required(args, "--sha")
    const jobFile = required(args, "--job")
    const pack = loadSitePack(repoRoot)
    const store = ApprovalStore.load(path.join(root, ".sitebot/approvals.json"))
    const job = JSON.parse(readFileSync(path.join(root, jobFile), "utf8"))
    const decision = evaluateMerge({ headSha: sha, store, job, siteAdmins: pack.siteAdmins })
    console.log(JSON.stringify(decision, null, 2))
    if (!decision.ok) process.exitCode = 1
    return
  }

  throw new HarnessError(
    "USAGE",
    "sitebot run-fixture bga --root out | approve --sha --role --by | can-merge --sha --job",
  )
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function required(args: string[], name: string): string {
  const value = flag(args, name)
  if (!value) throw new HarnessError("USAGE", `${name} is required`)
  return value
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
