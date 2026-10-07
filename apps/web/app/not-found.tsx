import Link from "next/link"

export default function NotFound() {
  return (
    <section className="panel">
      <h1>ページが見つかりません</h1>
      <p>下書きが無い、または番号が違います。</p>
      <p>
        <Link href="/">作業の選択に戻る</Link>
      </p>
    </section>
  )
}
