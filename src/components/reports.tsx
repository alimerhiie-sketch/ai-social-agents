import Link from "next/link";
import type { ReactNode } from "react";
import { prettyDate } from "@/lib/dates";
import { describeMix, type Mix, type Report } from "@/lib/analytics/review";
import { Badge, timeAgo } from "./ui";

// The Manager's weekly brief and the Analyst's weekly report, as stored in `reports`.

type Piece = { content_id: number; title: string; numbers: string; why: string };
type Rec = { area: string; recommendation: string; evidence: string; priority: string };
type Decision = { question: string; why: string; recommendation: string };

const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="label">{title}</div>
      {children}
    </div>
  );
}

function Bullets({ items, tone = "text-muted" }: { items: string[]; tone?: string }) {
  return (
    <ul className={`flex flex-col gap-1.5 text-[13px] leading-relaxed ${tone}`}>
      {items.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-dim" />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function BriefCard({ brief, mix, accountName }: { brief: Report; mix: Mix; accountName?: string }) {
  const d = brief.data;
  const decisions = list<Decision>(d.decisions);
  const risks = list<string>(d.risks);
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-dim">
        <Badge tone="accent">Manager</Badge>
        <span>
          Week of {prettyDate(brief.period_start)} – {prettyDate(brief.period_end)}
          {accountName ? ` · ${accountName}` : ""} · {timeAgo(brief.created_at)}
        </span>
      </div>
      <h3 className="mt-3 text-[17px] font-medium leading-snug tracking-[-0.01em] text-fg">{text(d.headline)}</h3>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-muted">{text(d.account_state)}</p>

      {decisions.length > 0 && (
        <div className="mt-5 rounded-lg border border-warn/30 bg-warn/[0.04] p-4">
          <div className="label !text-warn">Needs your decision</div>
          <div className="flex flex-col gap-3">
            {decisions.map((x, i) => (
              <div key={i} className="text-[13px] leading-relaxed">
                <div className="font-medium text-fg">{x.question}</div>
                <div className="text-muted">{x.why}</div>
                <div className="text-muted">
                  <span className="text-dim">Manager suggests: </span>
                  {x.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Block title="Next week the team will">
          <Bullets items={list<string>(d.next_week)} />
        </Block>
        <Block title="What the Manager changed">
          <Bullets items={brief.changes} />
          {mix.set_at && (
            <details className="mt-2 text-[12px]">
              <summary className="cursor-pointer text-dim hover:text-fg">Mix in effect now</summary>
              <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-muted">{describeMix(mix)}</pre>
              {mix.reason && <p className="mt-1 text-dim">{mix.reason}</p>}
            </details>
          )}
        </Block>
      </div>
      {risks.length > 0 && (
        <div className="mt-5">
          <Block title="Watch out">
            <Bullets items={risks} tone="text-bad/90" />
          </Block>
        </div>
      )}
      <div className="mt-5 border-t border-line pt-3 text-[12px]">
        <Link href={`/analytics?account=${brief.account_id}`} className="text-muted underline decoration-line-2 underline-offset-4 hover:text-fg">
          The numbers behind it →
        </Link>
      </div>
    </div>
  );
}

export function AnalysisReport({ report }: { report: Report }) {
  const d = report.data;
  const recs = list<Rec>(d.recommendations);
  const best = list<Piece>(d.best);
  const worst = list<Piece>(d.worst);
  const formats = list<{ format: string; pieces: number; avg_views: number; avg_reach: number; avg_interactions: number; verdict: string }>(d.formats);
  const fg = (d.follower_growth ?? {}) as { start?: number; end?: number; change?: number; note?: string };
  const prio = (p: string) => (p === "high" ? "accent" : p === "medium" ? "info" : "neutral") as "accent" | "info" | "neutral";
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-dim">
        <Badge tone="info">Analyst</Badge>
        <span>
          {prettyDate(report.period_start)} – {prettyDate(report.period_end)} · {timeAgo(report.created_at)}
        </span>
      </div>
      <h3 className="mt-3 text-[17px] font-medium leading-snug tracking-[-0.01em] text-fg">{text(d.headline)}</h3>
      <p className="mt-1.5 text-[12.5px] text-dim">{text(d.data_quality)}</p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Block title="Worked">
          <Bullets items={list<string>(d.worked).length ? list<string>(d.worked) : ["Nothing stood out yet."]} />
        </Block>
        <Block title="Didn't">
          <Bullets items={list<string>(d.didnt_work)} />
        </Block>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {[
          ["Best pieces", best],
          ["Weakest pieces", worst],
        ].map(([title, items]) => (
          <Block key={title as string} title={title as string}>
            <div className="flex flex-col gap-2.5">
              {(items as Piece[]).map((p) => (
                <div key={p.content_id} className="text-[13px] leading-relaxed">
                  <Link href={`/pipeline/${p.content_id}`} className="font-medium text-fg hover:text-accent">
                    #{p.content_id} {p.title}
                  </Link>
                  <div className="font-mono text-[12px] text-muted">{p.numbers}</div>
                  <div className="text-dim">{p.why}</div>
                </div>
              ))}
            </div>
          </Block>
        ))}
      </div>

      {formats.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <div className="label">By format</div>
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.08em] text-dim">
              <tr>
                <th className="py-1.5 font-medium">Format</th>
                <th className="py-1.5 text-right font-medium">Pieces</th>
                <th className="py-1.5 text-right font-medium">Avg views</th>
                <th className="py-1.5 text-right font-medium">Avg reach</th>
                <th className="py-1.5 text-right font-medium">Avg interactions</th>
                <th className="py-1.5 pl-4 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {formats.map((f) => (
                <tr key={f.format}>
                  <td className="py-1.5 text-fg">{f.format}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted">{f.pieces}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted">{Math.round(f.avg_views * 10) / 10}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted">{Math.round(f.avg_reach * 10) / 10}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted">{Math.round(f.avg_interactions * 10) / 10}</td>
                  <td className="py-1.5 pl-4 text-muted">{f.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-[13px] leading-relaxed sm:grid-cols-[130px_1fr]">
        {[
          ["Hooks", text(d.hooks)],
          ["Topics", text(d.topics)],
          ["Art styles", text(d.art_styles)],
          ["Posting times", text(d.posting_times)],
          ["Followers", fg.end != null ? `${fg.start ?? "?"} → ${fg.end} (${(fg.change ?? 0) >= 0 ? "+" : ""}${fg.change ?? 0}). ${fg.note ?? ""}` : ""],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dim">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
      </dl>

      <div className="mt-5">
        <div className="label">Recommendations for the Strategist (sent with every script job)</div>
        <div className="flex flex-col gap-2.5">
          {recs.map((r, i) => (
            <div key={i} className="flex gap-3 text-[13px] leading-relaxed">
              <div className="w-16 shrink-0 pt-0.5">
                <Badge tone={prio(r.priority)}>{r.priority}</Badge>
              </div>
              <div>
                <div className="text-fg">{r.recommendation}</div>
                <div className="text-dim">
                  {r.area} · {r.evidence}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
