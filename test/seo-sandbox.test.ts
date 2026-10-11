import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { setup, checked, fetchHtml } from "./helpers/seo-fixture.ts"
import { createSeoMetadataDraft } from "../src/application/seo-draft.ts"
import { getSeoDraftReview, recordSeoDraftReview, exportSeoDraftHandoff, recheckSeoDraftSource } from "../src/application/seo-draft-review.ts"
import { verifySeoHandoff } from "../src/seo-handoff.ts"
import { applyMetadataProposal, metadataChanges } from "../src/seo-metadata.ts"
import { presentAchievement } from "../src/render.ts"
import { loadSitePack } from "../src/sitepack.ts"

test("isolated SEO workflow: review, handoff, CLI, sandbox application and rendered content preservation", async () => {
  const { ctx, input, created } = await setup()
  try {
    const originalFile = path.join(ctx.dataRoot, "original", created.relativePath)
    const untouched = readFileSync(originalFile,"utf8")
    const draft = await createSeoMetadataDraft(ctx, { ...input, proposal: { title: "BGA取り外しの自社検証", h1: "BGA取り外しを自社検証で確認", description: "自社で検証したBGA取り外しの工程と観察内容をご紹介します。" } })
    const exportNow = () => exportSeoDraftHandoff(ctx, draft.jobId, { revision: getSeoDraftReview(ctx,draft.jobId)!.revision })
    assert.throws(exportNow)
    let detail = await checked(ctx,draft.jobId)
    const reviewer = { ...ctx, user: { id:"technical-reviewer",displayName:"検証担当",roles:["technical-reviewer" as const] } }
    for (const claim of detail.review) detail = recordSeoDraftReview(reviewer,draft.jobId,{ revision:detail.revision,claimId:claim.detail.id,decision:"confirmed",note:"サンドボックス内の自社検証fixtureと照合" })
    const handoff = exportNow()
    const packageFile = path.join(ctx.dataRoot,"handoff.json")
    writeFileSync(packageFile,JSON.stringify(handoff))
    const root = path.join(ctx.dataRoot,"sandbox-target")
    const targetFile = path.join(root,handoff.targetPath)
    mkdirSync(path.dirname(targetFile),{recursive:true})
    writeFileSync(targetFile,untouched)
    const cli = JSON.parse(execFileSync(process.execPath,["--import","tsx","src/cli.ts","verify-seo-handoff","--file",packageFile,"--root",root],{cwd:ctx.packRoot,encoding:"utf8"}))
    assert.equal(cli.ok,true)
    assert.equal(cli.publicationApproved,false)
    assert.equal(readFileSync(targetFile,"utf8"),untouched)
    // Deliberate application only to this freshly-created temporary sandbox, never an arbitrary --root.
    const candidate = applyMetadataProposal(handoff.original,handoff.proposal)
    writeFileSync(targetFile,JSON.stringify(candidate))
    const pack = loadSitePack(ctx.packRoot)
    const before = presentAchievement(handoff.original,pack)
    const after = presentAchievement(candidate,pack)
    const { title: oldTitle, heading: oldHeading, description: oldDescription, reviewRows: oldRows, ...beforeBody } = before
    const { title, heading, description, reviewRows: newRows, ...afterBody } = after
    assert.deepEqual(afterBody,beforeBody)
    assert.deepEqual(newRows,oldRows.map(row => row.label === "ページタイトル" ? { ...row, text: candidate.generated.title } : row.label === "検索結果の説明" ? { ...row, text: candidate.generated.description } : row))
    assert.equal(title,handoff.proposal.title)
    assert.equal(heading,handoff.proposal.h1)
    assert.equal(description,handoff.proposal.description)
    assert.deepEqual(metadataChanges(handoff.original,candidate).map(c=>c.field),["title","h1","description"])
    assert.deepEqual(candidate.facts,handoff.original.facts)
    assert.equal(readFileSync(originalFile,"utf8"),untouched)
    assert.throws(()=>verifySeoHandoff(handoff,root),/元JSON/)
    detail = recordSeoDraftReview(reviewer,draft.jobId,{revision:detail.revision,claimId:"seo-source-review",decision:"needs_changes",note:"検証のため差し戻し"})
    assert.throws(exportNow)
    detail = await recheckSeoDraftSource(ctx,draft.jobId,{revision:detail.revision},fetchHtml("<html><head><title>変更後</title></head><body><h1>変更</h1></body></html>"))
    assert.equal(detail.origin.status,"changed")
    assert.throws(exportNow)
    console.log("sandbox: 3 metadata fields reflected; rendered body/photos preserved; stale target, returned review and changed HTML blocked")
  } finally { rmSync(ctx.dataRoot,{recursive:true,force:true}) }
})
