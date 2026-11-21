import Link from "next/link";
import { notFound } from "next/navigation";
import { q, sql } from "@/lib/db";
import { FORMATS, VIDEO_STYLES } from "@/lib/options";
import type { Strategy } from "@/lib/types";
import { connectComposio, connectInstagram, connectTikTok, disconnect, runCycle, runJob, runPlanWeek, saveTikTokVerification } from "../../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Empty, FormatBadge, PageHeader, Section, TextLink, timeAgo } from "@/components/ui";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await q.account(Number(id));
  if (!a) notFound();
  const c = await q.counts(a.id);
  const trends = await q.trends({ accountId: a.id, status: "new", limit: 4 });
  const content = await q.content({ accountId: a.id, limit: 6 });
  const label = (list: { id: string; label: string }[], ids: string[]) => ids.map((i) => list.find((x) => x.id === i)?.label ?? i);

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title={a.name}
        actions={
          <>
            <Link href={`/accounts/${a.id}/edit`} className="btn btn-ghost">
              Edit profile
            </Link>
            <form action={runCycle.bind(null, a.id)}>
              <SubmitButton className="btn btn-primary" pending="Queuing…">
                Run weekly cycle
              </SubmitButton>
            </form>
          </>
        }
      >
        {a.niche}
      </PageHeader>


      <div className="mb-10 grid gap-3 md:grid-cols-3">
        <ActionCard
          title="Build strategy"
          body={a.strategy ? `Last built ${timeAgo(a.strategy_updated_at)}. Rebuild after big profile changes or once you have feedback.` : "Positioning, pillars, cadence, bios and a 30-day plan."}
          action={runJob.bind(null, "strategy", a.id)}
          label={a.strategy ? "Rebuild" : "Build strategy"}
          agent="Strategist"
        />
        <ActionCard title="Find trends" body={`${c.newTrends} unused trends right now. Scans TikTok, Google, Reddit, YouTube and news.`} action={runJob.bind(null, "trends", a.id)} label="Scan now" agent="Trend Scout" />
        <ActionCard
          title="Plan the next 7 days"
          body={`${a.reels_per_day} video${a.reels_per_day === 1 ? "" : "s"} + ${a.posts_per_day} post${a.posts_per_day === 1 ? "" : "s"} a day, one run per day. Days already planned are skipped.`}
          action={runPlanWeek.bind(null, a.id)}
          label="Plan 7 days"
          agent="Strategist"
        />
      </div>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Language" value={a.language} />
        <Fact label="Platforms" value={a.platforms.map((p) => (p === "instagram" ? `Instagram${a.ig_handle ? ` @${a.ig_handle}` : ""}` : `TikTok${a.tiktok_handle ? ` @${a.tiktok_handle}` : ""}`)).join(" · ")} />
        <Fact label="Daily output" value={`${a.reels_per_day} video${a.reels_per_day === 1 ? "" : "s"} + ${a.posts_per_day} post${a.posts_per_day === 1 ? "" : "s"} · ${7 * (a.reels_per_day + a.posts_per_day)}/week`} />
        <Fact label="Formats · styles" value={[...label(FORMATS, a.formats), ...label(VIDEO_STYLES, a.video_styles)].join(", ") || "—"} />
      </div>

      <Connections accountId={a.id} igHandle={a.ig_handle} />

      {a.strategy ? <StrategyView s={a.strategy} /> : (
        <Section title="Strategy">
          <Empty title="No strategy yet">Build it first. Everything the agents plan follows from it.</Empty>
        </Section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Freshest trends" aside={<TextLink href={`/trends?account=${a.id}`}>All trends</TextLink>}>
          {trends.length === 0 ? (
            <div className="text-sm text-dim">None yet. Run Find trends.</div>
          ) : (
            <div className="panel divide-y divide-line">
              {trends.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 font-mono text-xs tabular-nums text-accent">{t.fit_score}</span>
                  <div className="min-w-0">
                    <div className="text-sm text-fg">{t.title}</div>
                    <div className="line-clamp-1 text-xs text-dim">{t.angle}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Latest scripts" aside={<TextLink href={`/pipeline?account=${a.id}`}>Pipeline</TextLink>}>
          {content.length === 0 ? (
            <div className="text-sm text-dim">None yet. Run Plan the week.</div>
          ) : (
            <div className="panel divide-y divide-line">
              {content.map((it) => (
                <Link key={it.id} href={`/pipeline/${it.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-2">
                  <FormatBadge format={it.format} />
                  <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                  <Badge tone={it.status === "approved" ? "good" : it.status === "rejected" ? "bad" : "neutral"}>{it.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

async function ActionCard({ title, body, action, label, agent }: { title: string; body: string; action: () => Promise<void>; label: string; agent: string }) {
  return (
    <div className="panel flex flex-col p-5">
      <div className="eyebrow">{agent}</div>
      <div className="mt-2 text-[15px] font-medium">{title}</div>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{body}</p>
      <form action={action} className="mt-4">
        <SubmitButton className="btn w-full" pending="Starting…">
          {label}
        </SubmitButton>
      </form>
    </div>
  );
}

async function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[13px] text-fg">{value}</div>
    </div>
  );
}

async function StrategyView({ s }: { s: Strategy }) {
  return (
    <Section title="Strategy">
      <div className="space-y-3">
        <div className="panel grid gap-6 p-6 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-2">Positioning</div>
            <p className="text-[14px] leading-relaxed text-fg">{s.positioning}</p>
          </div>
          <div>
            <div className="eyebrow mb-2">Audience</div>
            <p className="text-[14px] leading-relaxed text-muted">{s.audience}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(["instagram", "tiktok"] as const).map((p) => (
            <div key={p} className="panel p-5">
              <div className="flex items-center justify-between">
                <div className="eyebrow">{p === "instagram" ? "Instagram bio" : "TikTok bio"}</div>
                <CopyButton text={s.bio[p]} />
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-fg">{s.bio[p]}</p>
            </div>
          ))}
        </div>

        <div className="panel p-6">
          <div className="eyebrow mb-4">Content pillars</div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {s.pillars.map((p) => (
              <div key={p.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="font-mono text-xs text-accent">{p.share_percent}%</span>
                </div>
                <div className="mt-2 h-px bg-line">
                  <div className="h-px bg-accent" style={{ width: `${p.share_percent}%` }} />
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{p.description}</p>
                <ul className="mt-2 space-y-1 text-xs text-dim">
                  {p.example_ideas.map((e) => (
                    <li key={e}>— {e}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="panel p-6">
            <div className="eyebrow mb-3">Format mix</div>
            <div className="space-y-3">
              {s.formats.map((f, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-8 shrink-0 font-mono text-sm text-accent">{f.per_week}×</span>
                  <div>
                    <div className="flex gap-1.5">
                      <FormatBadge format={f.format} />
                      <Badge tone="info">{f.platform}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{f.why}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-6">
            <div className="eyebrow mb-3">Cadence · {s.cadence.posts_per_week} posts / week</div>
            <div className="flex flex-wrap gap-1.5">
              {s.cadence.best_times.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{s.cadence.notes}</p>
            <div className="eyebrow mb-2 mt-6">Voice</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <List items={s.voice.do} mark="+" tone="text-good" />
              <List items={s.voice.dont} mark="−" tone="text-bad" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="panel p-6">
            <div className="eyebrow mb-3">Growth plays</div>
            <List items={s.growth_plays} mark="→" tone="text-accent" />
          </div>
          <div className="panel p-6">
            <div className="eyebrow mb-3">First 30 days</div>
            <List items={s.first_30_days} mark="·" tone="text-muted" />
          </div>
          <div className="panel p-6">
            <div className="eyebrow mb-3">What we measure</div>
            <List items={s.kpis} mark="◦" tone="text-info" />
          </div>
        </div>
      </div>
    </Section>
  );
}

async function List({ items, mark, tone }: { items: string[]; mark: string; tone: string }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted">
          <span className={`${tone} shrink-0`}>{mark}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

async function Connections({ accountId, igHandle }: { accountId: number; igHandle: string }) {
  const ig = await q.connection(accountId, "instagram");
  const err = await q.setting(`connect-error:${accountId}`, "");
  const tt = await q.connection(accountId, "tiktok");
  const ttErr = await q.setting(`connect-error-tiktok:${accountId}`, "");
  const verifyFiles = (await sql.all<{ key: string }>("SELECT key FROM settings WHERE key LIKE 'tiktok_verify:%'")).map((r) => r.key.slice("tiktok_verify:".length));
  return (
    <Section title="Connections">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Instagram</div>
            {ig ? <Badge tone="good">Auto-posting</Badge> : <Badge tone="warn">Not connected</Badge>}
          </div>
          {ig ? (
            <>
              <p className="mt-2 text-[13px] text-muted">
                Connected as <span className="text-fg">@{ig.username}</span>
                {ig.provider === "composio" ? (
                  <>
                    {" "}through Composio (account <span className="font-mono text-xs">{ig.provider_account_id}</span>). Composio keeps the login
                    fresh; the Publisher posts scheduled pieces automatically every 5 minutes.
                  </>
                ) : (
                  <>
                    . The Publisher posts scheduled pieces automatically and keeps the token refreshed
                    {ig.expires_at ? ` (currently valid until ${new Date(ig.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Beirut" })})` : ""}.
                  </>
                )}
              </p>
              {err && <p className="mt-2 text-xs text-bad">{err}</p>}
              <div className="mt-3 flex gap-2">
                {ig.provider === "composio" && (
                  <form action={connectComposio.bind(null, accountId)}>
                    <SubmitButton className="btn btn-ghost btn-sm" pending="Checking…">
                      Re-check
                    </SubmitButton>
                  </form>
                )}
                <form action={disconnect.bind(null, accountId, "instagram")}>
                  <SubmitButton className="btn btn-ghost btn-sm">Disconnect</SubmitButton>
                </form>
              </div>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-[13px] leading-relaxed text-muted">
                Connect {igHandle ? `@${igHandle}` : "this account"} in Composio (Instagram, log in with Facebook), then press Connect here. Until it&apos;s
                connected, Instagram posts go to your phone page like TikTok.
              </p>
              <form action={connectComposio.bind(null, accountId)}>
                <SubmitButton className="btn btn-sm" pending="Looking it up…">
                  Connect via Composio
                </SubmitButton>
              </form>
              {err && <p className="text-xs text-bad">{err}</p>}
              <details className="text-[13px] text-muted">
                <summary className="cursor-pointer text-dim">Or paste a Meta access token</summary>
                <form action={connectInstagram.bind(null, accountId)} className="mt-2 space-y-2">
                  <input name="token" type="password" autoComplete="off" placeholder="Instagram access token" className="input font-mono text-xs" />
                  <SubmitButton className="btn btn-sm" pending="Checking…">
                    Connect
                  </SubmitButton>
                </form>
              </details>
            </div>
          )}
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">TikTok</div>
            {tt ? <Badge tone="good">Connected</Badge> : <Badge tone="info">Phone hand-off</Badge>}
          </div>
          {tt ? (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Connected as <span className="text-fg">@{tt.username}</span> through Composio and the AMX Publisher TikTok app. Open a TikTok post on
                the Schedule page and press <span className="text-fg">Post via API</span> to choose its settings; it then posts automatically at its
                time. Until TikTok approves the app, its posts are private and the account must be private.
              </p>
              <div className="mt-3 flex gap-2">
                <form action={connectTikTok.bind(null, accountId)}>
                  <SubmitButton className="btn btn-ghost btn-sm" pending="Checking…">
                    Re-check
                  </SubmitButton>
                </form>
                <form action={disconnect.bind(null, accountId, "tiktok")}>
                  <SubmitButton className="btn btn-ghost btn-sm">Disconnect</SubmitButton>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Until TikTok is connected, TikTok pieces appear on your phone page when they&apos;re due: download, copy the caption, post in the app.
                To post automatically: set up the TikTok app in Composio, log in with the account there, then press Connect.
              </p>
              <div className="mt-3 flex gap-2">
                <form action={connectTikTok.bind(null, accountId)}>
                  <SubmitButton className="btn btn-sm" pending="Looking it up…">
                    Connect via Composio
                  </SubmitButton>
                </form>
                <a href="/post" className="btn btn-ghost btn-sm">
                  Phone page
                </a>
              </div>
            </>
          )}
          {ttErr && <p className="mt-2 text-xs text-bad">{ttErr}</p>}
          <details className="mt-4 text-[13px] text-muted">
            <summary className="cursor-pointer text-dim">
              TikTok URL ownership file{verifyFiles.length ? ` (${verifyFiles.length} saved)` : ""}
            </summary>
            <p className="mt-2 text-xs">
              TikTok pulls videos from <span className="font-mono">/api/media/</span>. Paste the file TikTok gives you when you verify that URL prefix;
              it&apos;s served at <span className="font-mono">/api/media/&lt;file name&gt;</span>.
            </p>
            {verifyFiles.map((f) => (
              <a key={f} href={`/api/media/${f}`} className="mt-1 block font-mono text-xs underline">
                {f}
              </a>
            ))}
            <form action={saveTikTokVerification} className="mt-2 space-y-2">
              <input name="name" placeholder="File name, e.g. tiktokAbC123.txt" className="input font-mono text-xs" />
              <input name="body" placeholder="The line inside the file" className="input font-mono text-xs" />
              <SubmitButton className="btn btn-sm">Save file</SubmitButton>
            </form>
          </details>
        </div>
      </div>
    </Section>
  );
}
