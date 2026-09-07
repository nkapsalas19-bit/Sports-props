import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LineEdge — Best Props & Moneylines",
  description: "Scans lines across NBA, NFL, MLB, and soccer, ranks them by modeled edge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-white/10 bg-black/30 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg tracking-tight">
              Line<span className="text-emerald-400">Edge</span>
            </Link>
            <nav className="flex gap-5 text-sm text-white/70">
              <Link href="/" className="hover:text-white transition">
                Best Picks
              </Link>
              <Link href="/challenges" className="hover:text-white transition">
                Bankroll Challenges
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
