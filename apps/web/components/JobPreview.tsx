import Link from "next/link"
import type { JobView } from "sitebot/application"

export function JobPreview({ job, requesterLabel }: { job: JobView; requesterLabel: string }) {
  const preview = job.preview
  return (
    <div className="stack">
      <p className="back">
        <Link href="/">作業の選択に戻る</Link>
      </p>
      <div className={`status status-${job.phase}`}>
        <strong>{job.phaseLabel}</strong>
        <span>{job.phaseNote}</span>
      </div>
      <div className="review-layout">
        <article className="preview panel">
          <p className="eyebrow">完成イメージ</p>
          <h1>{preview.heading}</h1>
          <p className="lead">{preview.lead}</p>
          {preview.tags.length > 0 ? (
            <ul className="tags">
              {preview.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : null}
          {preview.purpose ? (
            <section>
              <h2>目的</h2>
              <p>{preview.purpose}</p>
            </section>
          ) : null}
          {preview.contextNote ? <p>{preview.contextNote}</p> : null}
          {preview.origin ? <p>{preview.origin}</p> : null}
          <section>
            <h2>課題</h2>
            <p className="preserve">{preview.challenge}</p>
          </section>
          <section>
            <h2>対応</h2>
            {preview.solutionHeadline ? <h3>{preview.solutionHeadline}</h3> : null}
            {preview.solutionBody ? <p className="preserve">{preview.solutionBody}</p> : null}
          </section>
          {preview.openingImages.map((image) => (
            <figure key={image.file}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/images/${image.file}`} alt={image.alt} />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ))}
          {preview.sections.map((section, index) => (
            <section key={`${section.title}-${index}`}>
              <h2>
                工程 {index + 1}. {section.title}
              </h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p className="preserve" key={`${paragraphIndex}-${paragraph.slice(0, 12)}`}>
                  {paragraph}
                </p>
              ))}
              {section.items.length > 0 ? (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {section.formulas.map((formula) => (
                <p key={formula.text}>
                  {formula.text}
                  {formula.note ? <small> {formula.note}</small> : null}
                </p>
              ))}
              {section.notes.map((note) => (
                <p key={note}>※{note}</p>
              ))}
              {section.images.map((image) => (
                <figure key={image.file}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/images/${image.file}`} alt={image.alt} />
                  <figcaption>
                    {image.caption}
                    {image.substituteNote ? `（${image.substituteNote}）` : ""}
                    {image.scaleBars.length > 0 ? ` ${image.scaleBars.join(" / ")}` : ""}
                    {image.legend ? ` ${image.legend}` : ""}
                  </figcaption>
                </figure>
              ))}
            </section>
          ))}
          <section>
            <h2>結果</h2>
            <p className="preserve">{preview.outcome}</p>
          </section>
          {preview.notes.map((note) => (
            <p key={note}>※{note}</p>
          ))}
          <p className="meta">依頼者: {requesterLabel}</p>
        </article>
        <aside className="claims panel">
          <h2>技術確認</h2>
          {job.pendingCount > 0 ? (
            <p className="pending-count">{job.pendingCount}件確認待ち</p>
          ) : (
            <p>確認待ちの項目はありません。</p>
          )}
          <ul className="claim-list">
            {job.claims.map((claim) => (
              <li key={claim.detail.id}>
                <p className="claim-status">{claim.statusLabel}</p>
                <h3>{claim.headline}</h3>
                {claim.quotation !== claim.headline ? <p>「{claim.quotation}」</p> : null}
                <p>{claim.explanation}</p>
                <p className="claim-meta">
                  {claim.locationLabel} / {claim.kindLabel} / {claim.sourceLabel}
                </p>
                <details>
                  <summary>担当者向けの詳細</summary>
                  <dl>
                    <dt>識別子</dt>
                    <dd>{claim.detail.id}</dd>
                    <dt>箇所</dt>
                    <dd>{claim.detail.location}</dd>
                    <dt>種類</dt>
                    <dd>{claim.detail.kind}</dd>
                    <dt>出典</dt>
                    <dd>{claim.detail.source}</dd>
                    <dt>状態</dt>
                    <dd>{claim.detail.status}</dd>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
