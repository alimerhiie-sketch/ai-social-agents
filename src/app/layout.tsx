import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LiveIndicator, NavLink } from "@/components/client";
import "@/lib/agents/runner"; // boots the job queue with the server
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent HQ",
  description: "Control room for the AI agents that grow your Instagram and TikTok accounts.",
};

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12h7V3H3v9zm0 9h7v-7H3v7zm11 0h7v-9h-7v9zm0-18v7h7V3h-7z" },
  { href: "/accounts", label: "Accounts", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0" },
  { href: "/trends", label: "Trends", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/pipeline", label: "Pipeline", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" },
  { href: "/agents", label: "Agents", icon: "M12 3v3m0 12v3M3 12h3m12 0h3M7 7l2 2m6 6l2 2m0-10l-2 2M9 15l-2 2M12 9a3 3 0 100 6 3 3 0 000-6z" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        <div className="flex min-h-dvh flex-col md:flex-row">
          <aside className="border-b border-line md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-b-0 md:border-r">
            <div className="flex h-full flex-col gap-6 p-4 md:p-5">
              <div className="flex items-center gap-2.5 px-1">
                <div className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-semibold tracking-[-0.01em]">Agent HQ</div>
                  <div className="text-[11px] text-dim">Phase 1 · Strategy</div>
                </div>
              </div>
              <nav className="-mx-1 flex gap-1 overflow-x-auto md:mx-0 md:flex-col md:overflow-visible">
                {NAV.map((n) => (
                  <NavLink key={n.href} href={n.href}>
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={n.icon} />
                    </svg>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="hidden md:mt-auto md:block">
                <LiveIndicator />
              </div>
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 md:px-10 md:py-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
