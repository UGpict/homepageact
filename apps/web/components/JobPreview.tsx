import Link from "next/link"
import type { PublishedBlock, PublishedImage } from "../../../src/render.ts"
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
          <p className="published-title">
            <span>ページタイトル</span>
            {preview.title}
          </p>
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
            <Figure key={image.file} image={image} />
          ))}
          {preview.sections.map((section, index) => (
            <section key={`${section.title}-${index}`}>
              <h2>
                工程 {index + 1}. {section.title}
              </h2>
              {section.blocks.map((block, blockIndex) => (
                <BlockView key={blockIndex} block={block} />
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
                <Figure key={image.file} image={image} />
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
          {preview.statements.map((statement) => (
            <p key={statement}>{statement}</p>
          ))}
          <details className="published-extra" open>
            <summary>公開されるその他の内容（{preview.reviewRows.length}件）</summary>
            <p className="hint">ここに並ぶ文章も、ページと一緒に公開されます。</p>
            <dl>
              {preview.reviewRows.map((row, index) => (
                <div key={`${row.label}-${index}`}>
                  <dt>{row.label}</dt>
                  <dd className="preserve">{row.text}</dd>
                </div>
              ))}
            </dl>
          </details>
          <p className="meta">依頼者: {requesterLabel}</p>
        </article>
        <aside className="claims panel">
          <h2>技術確認</h2>
          {job.phase === "UNREVIEWABLE" ? (
            <p className="pending-count">技術確認の対象が見つからないため、この下書きは公開できません。</p>
          ) : job.pendingCount > 0 ? (
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

function Figure({ image }: { image: PublishedImage }) {
  return (
    <figure>
      <img src={`/api/images/${image.file}`} alt={image.alt} />
      <figcaption>
        {image.caption}
        {image.substituteNote ? `（${image.substituteNote}）` : ""}
        {image.scaleBars.length > 0 ? ` ${image.scaleBars.join(" / ")}` : ""}
        {image.legend ? ` ${image.legend}` : ""}
      </figcaption>
    </figure>
  )
}

function BlockView({ block }: { block: PublishedBlock }) {
  if (block.type === "p") return <p className="preserve">{block.text}</p>
  if (block.type === "table") {
    return (
      <table>
        <thead>
          <tr>
            {block.head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (block.type === "image") return <Figure image={block.image} />
  return (
    <p>
      リンク: {block.label}
      {block.kind ? <small> {block.slug}</small> : null}
    </p>
  )
}
