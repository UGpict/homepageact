import Link from "next/link"

const tasks = [
  { href: "/seo", label: "検索データから改善を考える", ready: true },
  { href: "/achievements/new", label: "実績を追加する", ready: true },
  { href: "", label: "技術コラムを書く", ready: false },
  { href: "", label: "既存ページを修正", ready: false },
  { href: "", label: "画像を追加する", ready: false },
]

export default function HomePage() {
  return (
    <section className="panel">
      <h1>何をしますか？</h1>
      <p className="lede">やりたいことを選んでください。初めての方は「検索データから改善を考える」で練習できます。</p>
      <ul className="task-list">
        {tasks.filter(task => task.ready).map((task) => (
          <li key={task.label}>
            <Link className="task" href={task.href}>
              <span aria-hidden="true">＋</span>{task.label}
            </Link>
          </li>
        ))}
      </ul>
      <p><Link href="/seo/help">初めての方へ：使い方を見る</Link></p>
      <details><summary>これから追加する機能</summary><ul>{tasks.filter(task => !task.ready).map(task => <li key={task.label}>{task.label}（準備中）</li>)}</ul></details>
    </section>
  )
}
