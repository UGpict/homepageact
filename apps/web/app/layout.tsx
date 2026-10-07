import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "Sitebot",
  description: "社内向けのWebサイト更新",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <Link href="/">Sitebot</Link>
          <span>Webサイト更新</span>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  )
}
