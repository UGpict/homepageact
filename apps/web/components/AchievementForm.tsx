"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Term = { id: string; label: string }
type TagGroup = { id: string; label: string; terms: Term[] }
type WorkContext = "customer" | "internal" | "partner"
type ClearanceKey = "noCustomerName" | "noPartOrLotNumber" | "noLogo" | "noOtherConfidential"
type Depicts = "actual" | "substitute" | "diagram"

type FormOptions = {
  workContexts: Array<{ id: WorkContext; label: string }>
  tagGroups: TagGroup[]
}

type StepDraft = {
  key: string
  summary: string
  detail: string
  items: string
  formula: string
  formulaNote: string
  notes: string
  imageIds: string[]
}

type ImageDraft = {
  uploadId: string
  file: string
  memo: string
  depicts: Depicts
  substituteNote: string
  legend: string
  scaleBars: string
  clearance: Record<ClearanceKey, boolean>
}

type HumanError = { title: string; message: string; next: string; detail?: string; field?: string }

const STORAGE_KEY = "sitebot-achievement-draft-v1"

const CLEARANCE: Array<[ClearanceKey, string]> = [
  ["noCustomerName", "顧客名が含まれていない"],
  ["noPartOrLotNumber", "部品番号・ロット番号が含まれていない"],
  ["noLogo", "顧客ロゴが含まれていない"],
  ["noOtherConfidential", "その他の機密情報が含まれていない"],
]

const DEPICTS: Array<[Depicts, string]> = [
  ["actual", "実物"],
  ["substitute", "代替画像"],
  ["diagram", "図"],
]

function emptyClearance(): Record<ClearanceKey, boolean> {
  return {
    noCustomerName: false,
    noPartOrLotNumber: false,
    noLogo: false,
    noOtherConfidential: false,
  }
}

function emptyStep(): StepDraft {
  return {
    key: crypto.randomUUID(),
    summary: "",
    detail: "",
    items: "",
    formula: "",
    formulaNote: "",
    notes: "",
    imageIds: [],
  }
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function AchievementForm({ options }: { options: FormOptions }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [challenge, setChallenge] = useState("")
  const [clientPurpose, setClientPurpose] = useState("")
  const [workContext, setWorkContext] = useState<WorkContext>("customer")
  const [outcome, setOutcome] = useState("")
  const [scopeNotes, setScopeNotes] = useState("")
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep(), emptyStep()])
  const [tags, setTags] = useState<Record<string, string[]>>({})
  const [images, setImages] = useState<ImageDraft[]>([])
  const [heroUploadId, setHeroUploadId] = useState("")
  const [youtubeId, setYoutubeId] = useState("")
  const [originOn, setOriginOn] = useState(false)
  const [originYear, setOriginYear] = useState("")
  const [originIndustry, setOriginIndustry] = useState("")
  const [originRequest, setOriginRequest] = useState("")
  const [originOngoing, setOriginOngoing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<HumanError | null>(null)
  const [uploadError, setUploadError] = useState<HumanError | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const draft = JSON.parse(saved) as Partial<Persisted>
        if (typeof draft.challenge === "string") setChallenge(draft.challenge)
        if (typeof draft.clientPurpose === "string") setClientPurpose(draft.clientPurpose)
        if (draft.workContext) setWorkContext(draft.workContext)
        if (typeof draft.outcome === "string") setOutcome(draft.outcome)
        if (typeof draft.scopeNotes === "string") setScopeNotes(draft.scopeNotes)
        if (Array.isArray(draft.steps) && draft.steps.length >= 2) setSteps(draft.steps.slice(0, 6))
        if (draft.tags) setTags(draft.tags)
        if (Array.isArray(draft.images)) setImages(draft.images)
        if (typeof draft.heroUploadId === "string") setHeroUploadId(draft.heroUploadId)
        if (typeof draft.youtubeId === "string") setYoutubeId(draft.youtubeId)
        if (typeof draft.originOn === "boolean") setOriginOn(draft.originOn)
        if (typeof draft.originYear === "string") setOriginYear(draft.originYear)
        if (typeof draft.originIndustry === "string") setOriginIndustry(draft.originIndustry)
        if (typeof draft.originRequest === "string") setOriginRequest(draft.originRequest)
        if (typeof draft.originOngoing === "boolean") setOriginOngoing(draft.originOngoing)
      } catch {
        sessionStorage.removeItem(STORAGE_KEY)
      }
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const persisted: Persisted = {
      challenge,
      clientPurpose,
      workContext,
      outcome,
      scopeNotes,
      steps,
      tags,
      images,
      heroUploadId,
      youtubeId,
      originOn,
      originYear,
      originIndustry,
      originRequest,
      originOngoing,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  }, [
    ready,
    challenge,
    clientPurpose,
    workContext,
    outcome,
    scopeNotes,
    steps,
    tags,
    images,
    heroUploadId,
    youtubeId,
    originOn,
    originYear,
    originIndustry,
    originRequest,
    originOngoing,
  ])

  useEffect(() => {
    if (!error) return
    const field = error.field
      ? document.querySelector<HTMLElement>(`[data-field="${CSS.escape(error.field)}"]`)
      : null
    const target = field ?? document.getElementById("form-error")
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    target?.focus()
  }, [error])

  const industries = options.tagGroups.find((group) => group.id === "industries")?.terms ?? []
  const blocked = useMemo(
    () =>
      blockReason({
        challenge,
        outcome,
        steps,
        images,
        uploading,
        submitting,
        originOn,
        originIndustry,
        originRequest,
      }),
    [challenge, outcome, steps, images, uploading, submitting, originOn, originIndustry, originRequest],
  )

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null)
    setUploading(true)
    try {
      for (const file of files) {
        const body = new FormData()
        body.append("file", file)
        const response = await fetch("/api/images", { method: "POST", body })
        const result = (await response.json()) as
          | { ok: true; upload: { id: string; file: string } }
          | { ok: false; error: HumanError }
        if (!result.ok) {
          setUploadError(result.error)
          continue
        }
        setImages((current) => [
          ...current,
          {
            uploadId: result.upload.id,
            file: result.upload.file,
            memo: "",
            depicts: "actual",
            substituteNote: "",
            legend: "",
            scaleBars: "",
            clearance: emptyClearance(),
          },
        ])
      }
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (blocked || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/achievements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      })
      const result = (await response.json()) as { ok: true; jobId: string } | { ok: false; error: HumanError }
      if (!result.ok) {
        setError(result.error)
        return
      }
      sessionStorage.removeItem(STORAGE_KEY)
      router.push(`/jobs/${result.jobId}`)
    } catch {
      setError({
        title: "下書きを作成できませんでした",
        message: "通信が中断されました。",
        next: "接続を確認して、もう一度下書きを作成してください。",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function payload() {
    const year = Number(originYear)
    return {
      challenge,
      clientPurpose,
      workContext,
      outcome,
      scopeNotes: lines(scopeNotes),
      tags: Object.fromEntries(options.tagGroups.map((group) => [group.id, tags[group.id] ?? []])),
      origin: originOn
        ? {
            year: originYear.trim() && Number.isInteger(year) ? year : undefined,
            industry: originIndustry,
            request: originRequest,
            ongoing: originOngoing,
          }
        : undefined,
      steps: steps.map((step) => ({
        summary: step.summary,
        detail: step.detail,
        items: lines(step.items),
        formulas: step.formula.trim()
          ? [{ text: step.formula.trim(), note: step.formulaNote.trim() || undefined }]
          : [],
        scopeNotes: lines(step.notes),
        imageIds: step.imageIds,
      })),
      images: images.map((image) => ({
        uploadId: image.uploadId,
        memo: image.memo,
        depicts: image.depicts,
        substituteNote: image.substituteNote,
        scaleBars: lines(image.scaleBars),
        legend: image.legend,
        clearance: image.clearance,
      })),
      heroUploadId,
      youtubeId,
    }
  }

  function updateStep(key: string, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)))
  }

  function updateImage(uploadId: string, patch: Partial<ImageDraft>) {
    setImages((current) => current.map((image) => (image.uploadId === uploadId ? { ...image, ...patch } : image)))
  }

  if (!ready) return <p className="panel">入力内容を読み込んでいます。</p>

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="panel">
        <h1>実績を追加する</h1>
        <p className="lede">分かっている事実を入力してください。公開用の文章は、この内容から下書きを作ります。</p>
      </div>
      {error ? (
        <div className="error" id="form-error" tabIndex={-1} role="alert">
          <strong>{error.title}</strong>
          <p>{error.message}</p>
          <p>{error.next}</p>
          {error.detail ? (
            <details>
              <summary>担当者向けの詳細</summary>
              <p>{error.detail}</p>
            </details>
          ) : null}
        </div>
      ) : null}
      <fieldset disabled={submitting || uploading}>
        <legend>基本情報</legend>
        <label>
          お客様が困っていたこと
          <textarea data-field="challenge" value={challenge} onChange={(event) => setChallenge(event.target.value)} required />
        </label>
        <label>
          お客様の目的（任意）
          <textarea value={clientPurpose} onChange={(event) => setClientPurpose(event.target.value)} />
        </label>
        <fieldset>
          <legend>案件の種別</legend>
          {options.workContexts.map((context) => (
            <label className="choice" key={context.id}>
              <input
                type="radio"
                name="workContext"
                checked={workContext === context.id}
                onChange={() => setWorkContext(context.id)}
              />
              {context.label}
            </label>
          ))}
        </fieldset>
        <label>
          結果
          <textarea data-field="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} required />
        </label>
        <label>
          補足事項（1行に1件、任意）
          <textarea value={scopeNotes} onChange={(event) => setScopeNotes(event.target.value)} />
        </label>
      </fieldset>

      <fieldset disabled={submitting || uploading}>
        <legend>作業工程</legend>
        <p className="hint">2件から6件まで追加できます。</p>
        {steps.map((step, index) => (
          <fieldset key={step.key}>
            <legend>工程 {index + 1}</legend>
            <label>
              工程名または概要
              <input
                data-field={`steps.${index}.summary`}
                type="text"
                value={step.summary}
                onChange={(event) => updateStep(step.key, { summary: event.target.value })}
                required
              />
            </label>
            <label>
              詳細メモ
              <textarea value={step.detail} onChange={(event) => updateStep(step.key, { detail: event.target.value })} />
            </label>
            <label>
              箇条書き（1行に1件、任意）
              <textarea value={step.items} onChange={(event) => updateStep(step.key, { items: event.target.value })} />
            </label>
            <label>
              計算式（任意）
              <input type="text" value={step.formula} onChange={(event) => updateStep(step.key, { formula: event.target.value })} />
            </label>
            <label>
              計算式の補足（任意）
              <input
                type="text"
                value={step.formulaNote}
                onChange={(event) => updateStep(step.key, { formulaNote: event.target.value })}
              />
            </label>
            <label>
              補足（1行に1件、任意）
              <textarea value={step.notes} onChange={(event) => updateStep(step.key, { notes: event.target.value })} />
            </label>
            <div>
              <p>使用画像</p>
              {images.length === 0 ? <p className="hint">画像を追加すると、ここから選べます。</p> : null}
              {images.map((image) => (
                <label className="choice" key={image.uploadId}>
                  <input
                    type="checkbox"
                    checked={step.imageIds.includes(image.uploadId)}
                    onChange={(event) => {
                      const imageIds = event.target.checked
                        ? [...step.imageIds, image.uploadId].slice(0, 3)
                        : step.imageIds.filter((id) => id !== image.uploadId)
                      updateStep(step.key, { imageIds })
                    }}
                  />
                  {image.memo || "説明未入力の画像"}
                </label>
              ))}
            </div>
            {steps.length > 2 ? (
              <button
                type="button"
                className="secondary"
                onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}
              >
                この工程を削除
              </button>
            ) : null}
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={steps.length >= 6}
          onClick={() => setSteps((current) => [...current, emptyStep()])}
        >
          工程を追加
        </button>
      </fieldset>

      <fieldset disabled={submitting || uploading}>
        <legend>分類</legend>
        <p className="hint">一覧にあるものだけ選べます。</p>
        {options.tagGroups
          .filter((group) => group.terms.length > 0)
          .map((group) => (
            <fieldset key={group.id} data-field={`tags.${group.id}`}>
              <legend>{group.label}</legend>
              <div className="checks">
                {group.terms.map((term) => (
                  <label key={term.id}>
                    <input
                      type="checkbox"
                      checked={tags[group.id]?.includes(term.id) ?? false}
                      onChange={(event) => {
                        const current = tags[group.id] ?? []
                        setTags({
                          ...tags,
                          [group.id]: event.target.checked
                            ? [...current, term.id]
                            : current.filter((id) => id !== term.id),
                        })
                      }}
                    />
                    {term.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
      </fieldset>

      <fieldset disabled={submitting || uploading} data-field="images">
        <legend>画像</legend>
        <p className="hint">実績には写真が1枚以上必要です。公開前に、写っていないことを確認してください。</p>
        <div
          className="drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void uploadFiles(event.dataTransfer.files)
          }}
        >
          <p>{uploading ? "画像を処理しています。" : "画像をここにドロップするか、ファイルを選んでください。"}</p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files)
              event.target.value = ""
            }}
          />
        </div>
        {uploadError ? (
          <div className="upload-error" role="alert">
            <strong>{uploadError.title}</strong>
            <p>{uploadError.message}</p>
            <p>{uploadError.next}</p>
          </div>
        ) : null}
        {images.map((image) => (
          <div className="image-card" key={image.uploadId}>
            {/* The preview is a same-origin processed image, not a remote optimizer URL. */}
            <img src={`/api/images/${image.file}`} alt="" />
            <label>
              この画像の説明
              <input
                type="text"
                value={image.memo}
                onChange={(event) => updateImage(image.uploadId, { memo: event.target.value })}
                required
              />
            </label>
            <fieldset>
              <legend>画像の種類</legend>
              {DEPICTS.map(([value, label]) => (
                <label className="choice" key={value}>
                  <input
                    type="radio"
                    name={`depicts-${image.uploadId}`}
                    checked={image.depicts === value}
                    onChange={() => updateImage(image.uploadId, { depicts: value })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {image.depicts === "substitute" ? (
              <label>
                代替である理由
                <input
                  data-field="substituteNote"
                  type="text"
                  value={image.substituteNote}
                  onChange={(event) => updateImage(image.uploadId, { substituteNote: event.target.value })}
                  required
                />
              </label>
            ) : null}
            <label>
              スケール（1行に1件、任意）
              <textarea value={image.scaleBars} onChange={(event) => updateImage(image.uploadId, { scaleBars: event.target.value })} />
            </label>
            <label>
              凡例（任意）
              <input type="text" value={image.legend} onChange={(event) => updateImage(image.uploadId, { legend: event.target.value })} />
            </label>
            <fieldset data-field="clearance">
              <legend>公開前の確認</legend>
              {CLEARANCE.map(([key, label]) => (
                <label className="choice" key={key}>
                  <input
                    type="checkbox"
                    checked={image.clearance[key]}
                    onChange={(event) =>
                      updateImage(image.uploadId, {
                        clearance: { ...image.clearance, [key]: event.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setImages((current) => current.filter((item) => item.uploadId !== image.uploadId))
                setSteps((current) =>
                  current.map((step) => ({
                    ...step,
                    imageIds: step.imageIds.filter((id) => id !== image.uploadId),
                  })),
                )
                if (heroUploadId === image.uploadId) setHeroUploadId("")
              }}
            >
              この画像を削除
            </button>
          </div>
        ))}
        {images.length > 0 ? (
          <label>
            代表画像（任意）
            <select value={heroUploadId} onChange={(event) => setHeroUploadId(event.target.value)}>
              <option value="">指定しない</option>
              {images.map((image, index) => (
                <option value={image.uploadId} key={image.uploadId}>
                  {image.memo || `画像 ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </fieldset>

      <fieldset disabled={submitting || uploading}>
        <legend>きっかけ（任意）</legend>
        <label className="choice">
          <input type="checkbox" checked={originOn} onChange={(event) => setOriginOn(event.target.checked)} />
          相談のきっかけを記録する
        </label>
        {originOn ? (
          <>
            <label>
              年（任意）
              <input type="number" value={originYear} onChange={(event) => setOriginYear(event.target.value)} />
            </label>
            <label>
              業種
              <select
                data-field="origin.industry"
                value={originIndustry}
                onChange={(event) => setOriginIndustry(event.target.value)}
                required
              >
                <option value="">選んでください</option>
                {industries.map((term) => (
                  <option value={term.id} key={term.id}>
                    {term.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              相談内容
              <textarea
                data-field="origin.request"
                value={originRequest}
                onChange={(event) => setOriginRequest(event.target.value)}
                required
              />
            </label>
            <label className="choice">
              <input type="checkbox" checked={originOngoing} onChange={(event) => setOriginOngoing(event.target.checked)} />
              その後も継続して依頼がある
            </label>
          </>
        ) : null}
      </fieldset>

      <details className="panel">
        <summary>動画ID（任意）</summary>
        <label>
          YouTubeの動画ID
          <input data-field="youtubeId" type="text" value={youtubeId} onChange={(event) => setYoutubeId(event.target.value)} />
        </label>
      </details>

      <div className="actions">
        <button type="submit" disabled={Boolean(blocked)}>
          {submitting ? "下書きを作成しています" : "下書きを作る"}
        </button>
        <span>{submitting ? "この画面を閉じずにお待ちください。操作はできません。" : blocked}</span>
      </div>
    </form>
  )
}

type Persisted = {
  challenge: string
  clientPurpose: string
  workContext: WorkContext
  outcome: string
  scopeNotes: string
  steps: StepDraft[]
  tags: Record<string, string[]>
  images: ImageDraft[]
  heroUploadId: string
  youtubeId: string
  originOn: boolean
  originYear: string
  originIndustry: string
  originRequest: string
  originOngoing: boolean
}

function blockReason(input: {
  challenge: string
  outcome: string
  steps: StepDraft[]
  images: ImageDraft[]
  uploading: boolean
  submitting: boolean
  originOn: boolean
  originIndustry: string
  originRequest: string
}): string | null {
  if (input.submitting) return "下書きを作成しています。操作はできません。"
  if (input.uploading) return "画像の処理が終わるまでお待ちください。"
  if (!input.challenge.trim()) return "困っていたことを入力してください。"
  if (!input.outcome.trim()) return "結果を入力してください。"
  if (input.steps.length < 2 || input.steps.length > 6) return "工程は2件から6件にしてください。"
  if (input.steps.some((step) => !step.summary.trim())) return "工程名が未入力の工程があります。"
  if (input.images.length < 1) return "実績には写真が1枚以上必要です。"
  if (input.images.some((image) => !image.memo.trim())) return "画像の説明を入力してください。"
  if (input.images.some((image) => image.depicts === "substitute" && !image.substituteNote.trim())) {
    return "代替画像には理由が必要です。"
  }
  if (input.images.some((image) => CLEARANCE.some(([key]) => !image.clearance[key]))) {
    return "画像の確認項目をすべてチェックしてください。"
  }
  if (input.originOn && (!input.originIndustry || !input.originRequest.trim())) {
    return "きっかけを記録する場合は、業種と相談内容を入力してください。"
  }
  return null
}
