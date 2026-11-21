"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pending: pendingLabel, className = "btn" }: { children: ReactNode; pending?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
        active ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}

type Active = { id: number; status: string; verb: string; account: string | null; notBefore: string | null };

export function LiveIndicator() {
  const [jobs, setJobs] = useState<Active[]>([]);
  const router = useRouter();
  const prev = useRef<number>(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/jobs/active", { cache: "no-store" });
        const d = (await r.json()) as { jobs: Active[] };
        if (!alive) return;
        setJobs(d.jobs);
        // A job just finished somewhere: refresh whatever page is open so new results appear.
        if (d.jobs.length < prev.current) router.refresh();
        prev.current = d.jobs.length;
      } catch {}
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [router]);

  const running = jobs.find((j) => j.status === "running");
  const queued = jobs.filter((j) => j.status === "queued").length;
  const waits = jobs.filter((j) => j.notBefore && new Date(j.notBefore) > new Date());
  if (!running && waits.length === jobs.length && jobs.length) {
    const at = new Date(Math.min(...waits.map((j) => new Date(j.notBefore!).getTime())));
    return (
      <Link href="/agents" className="block rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-2">
        <div className="flex items-center gap-2 text-xs text-warn">
          <span className="size-1.5 rounded-full bg-warn" />
          Paused until {at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="mt-1 text-[11px] text-dim">{jobs.length} waiting for the free image quota</div>
      </Link>
    );
  }
  if (!jobs.length)
    return (
      <div className="flex items-center gap-2 px-2.5 text-xs text-dim">
        <span className="size-1.5 rounded-full bg-line-2" /> All agents idle
      </div>
    );
  return (
    <Link href={running ? `/agents/jobs/${running.id}` : "/agents"} className="block rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-2">
      <div className="flex items-center gap-2 text-xs text-fg">
        <span className="live-dot size-1.5 rounded-full bg-accent" />
        {running ? running.verb : "Waiting to start"}
      </div>
      <div className="mt-1 truncate text-[11px] text-dim">
        {running?.account}
        {queued > 0 && ` · ${queued} queued`}
      </div>
    </Link>
  );
}

type JobPayload = {
  job: { id: number; status: string; summary: string | null; error: string | null };
  log: string[];
};

export function JobWatcher({ jobId, initial, resultHref }: { jobId: number; initial: JobPayload; resultHref: string }) {
  const [data, setData] = useState(initial);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const live = data.job.status === "running" || data.job.status === "queued";

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const d: JobPayload = await r.json();
        setData(d);
        if (d.job.status !== "running" && d.job.status !== "queued") router.refresh();
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [jobId, live, router]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [data.log.length]);

  return (
    <div className="space-y-4">
      <div ref={box} className="panel max-h-[480px] overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed">
        {data.log.length === 0 && <div className="text-dim">Waiting for the agent…</div>}
        {data.log.map((line, i) => (
          <div key={i} className={`rise whitespace-pre-wrap break-words ${lineColor(line)}`}>
            {line}
          </div>
        ))}
        {live && (
          <div className="mt-1 flex items-center gap-2 text-dim">
            <span className="live-dot size-1.5 rounded-full bg-accent" /> working
          </div>
        )}
      </div>
      {data.job.status === "done" && (
        <div className="panel flex flex-col gap-3 border-good/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-fg">{data.job.summary}</div>
          <Link href={resultHref} className="btn btn-primary">
            See the results
          </Link>
        </div>
      )}
      {data.job.status === "failed" && <FailureHelp error={data.job.error ?? "Unknown error"} />}
    </div>
  );
}

function lineColor(line: string) {
  if (line.startsWith("✓")) return "text-good";
  if (line.startsWith("✗")) return "text-bad";
  if (line.startsWith("⌕") || line.startsWith("↗")) return "text-info";
  if (line.startsWith("▸") || line.startsWith("⇢")) return "text-accent";
  if (line.startsWith("›")) return "text-fg";
  return "text-dim";
}

export function FailureHelp({ error }: { error: string }) {
  const auth = /authenticat|log ?in|signed in|sign in/i.test(error);
  return (
    <div className="panel border-bad/30 p-4 text-sm">
      <div className="text-bad">{error}</div>
      {auth && (
        <div className="mt-3 text-muted">
          Claude Code needs to be signed in to your subscription. In a terminal, run{" "}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">claude setup-token</code>, then put the token in{" "}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">.env.local</code> as{" "}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">CLAUDE_CODE_OAUTH_TOKEN=…</code> and restart the dashboard.
          This uses your subscription, not a paid API key.
        </div>
      )}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        // The Clipboard API only exists on https/localhost; on the Wi-Fi address (http://192.168…) use the old way.
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          t.setAttribute("readonly", "");
          t.style.position = "fixed";
          t.style.opacity = "0";
          document.body.appendChild(t);
          t.select();
          t.setSelectionRange(0, text.length);
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
