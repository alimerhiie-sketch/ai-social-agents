import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const TONES: Record<string, string> = {
  neutral: "border-line-2 text-muted",
  accent: "border-accent/40 text-accent",
  good: "border-good/40 text-good",
  warn: "border-warn/40 text-warn",
  bad: "border-bad/40 text-bad",
  info: "border-info/40 text-info",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function JobStatusBadge({ status }: { status: string }) {
  const tone = { queued: "neutral", running: "accent", done: "good", failed: "bad", cancelled: "neutral" }[status] as keyof typeof TONES;
  return (
    <Badge tone={tone}>
      {status === "running" && <span className="live-dot size-1.5 rounded-full bg-accent" />}
      {status}
    </Badge>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[13px] font-medium text-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function FitScore({ score }: { score: number }) {
  const color = score >= 75 ? "var(--color-accent)" : score >= 55 ? "var(--color-info)" : "var(--color-dim)";
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-11 shrink-0 place-items-center" title={`Fit score ${score}/100`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-line-2)" strokeWidth="2" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="font-mono text-[12px] tabular-nums text-fg">{score}</span>
    </div>
  );
}

export function FormatBadge({ format }: { format: string }) {
  const label = { reel: "Video", carousel: "Carousel", post: "Post", story: "Story" }[format] ?? format;
  return <Badge>{label}</Badge>;
}

export function PlatformBadge({ platform }: { platform: string }) {
  const label = { instagram: "IG", tiktok: "TikTok", both: "IG + TikTok" }[platform] ?? platform;
  return <Badge tone="info">{label}</Badge>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-muted underline decoration-line-2 underline-offset-4 transition-colors hover:text-fg hover:decoration-muted">
      {children}
    </Link>
  );
}

export function timeAgo(sqlDate: string | null) {
  if (!sqlDate) return "—";
  const then = new Date(sqlDate.replace(" ", "T") + "Z").getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function duration(ms: number | null) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
