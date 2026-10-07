import Link from "next/link"

const tasks = [
  { href: "/achievements/new", label: "実績を追加する", ready: true },
  { href: "", label: "技術コラムを書く", ready: false },
  { href: "", label: "既存ページを修正", ready: false },
  { href: "", label: "画像を追加する", ready: false },
]

export default function HomePage() {
  return (
    <section className="panel">
      <h1>何をしますか？</h1>
      <p className="lede">依頼の種類を選んでください。文章の書き方を指定する必要はありません。</p>
      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.label}>
            {task.ready ? (
              <Link className="task" href={task.href}>
                <span aria-hidden="true">＋</span>
                {task.label}
              </Link>
            ) : (
              <button type="button" className="task" disabled>
                <span aria-hidden="true">＋</span>
                {task.label}
                <small>準備中</small>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
