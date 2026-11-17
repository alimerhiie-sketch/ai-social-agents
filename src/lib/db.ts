import type { Account, Connection, ContentItem, Job, Post, Trend } from "./types";

// One async SQL interface, two backends:
//  - Cloudflare D1 binding (the dashboard and cron inside the Worker)
//  - the Worker's private /api/internal/sql endpoint (the GitHub Actions runner, via HQ_URL + HQ_SECRET)
// Every query in the app goes through `sql`, so the same code runs in both places.

type Arg = string | number | null | boolean | undefined;
export type RunResult = { changes: number; lastRowId: number };

export interface Sql {
  all<T = Row>(query: string, ...args: Arg[]): Promise<T[]>;
  get<T = Row>(query: string, ...args: Arg[]): Promise<T | null>;
  run(query: string, ...args: Arg[]): Promise<RunResult>;
}

const clean = (args: Arg[]) => args.map((a) => (a === undefined ? null : typeof a === "boolean" ? (a ? 1 : 0) : a));

// ---------- backend 1: D1 binding ----------

type D1Like = {
  prepare(q: string): {
    bind(...a: unknown[]): {
      all(): Promise<{ results: unknown[] }>;
      first(): Promise<unknown>;
      run(): Promise<{ meta: { changes?: number; last_row_id?: number } }>;
    };
  };
};

let pinned: D1Like | null = null;
/** The cron handler passes env.DB directly (no request context there). */
export function pinD1(d1: D1Like) {
  pinned = d1;
}

async function d1(): Promise<D1Like> {
  if (pinned) return pinned;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { DB: D1Like }).DB;
}

const d1Sql: Sql = {
  async all(query, ...args) {
    const r = await (await d1()).prepare(query).bind(...clean(args)).all();
    return r.results as never[];
  },
  async get(query, ...args) {
    return ((await (await d1()).prepare(query).bind(...clean(args)).first()) ?? null) as never;
  },
  async run(query, ...args) {
    const r = await (await d1()).prepare(query).bind(...clean(args)).run();
    return { changes: r.meta.changes ?? 0, lastRowId: r.meta.last_row_id ?? 0 };
  },
};

// ---------- backend 2: HTTP to the Worker (GitHub Actions runner) ----------

async function remote(mode: "all" | "get" | "run", query: string, args: Arg[]) {
  const res = await fetch(`${process.env.HQ_URL}/api/internal/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HQ_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode, query, args: clean(args) }),
  });
  if (!res.ok) throw new Error(`HQ sql ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { result: unknown };
}

const httpSql: Sql = {
  async all(query, ...args) {
    return (await remote("all", query, args)).result as never[];
  },
  async get(query, ...args) {
    return ((await remote("get", query, args)).result ?? null) as never;
  },
  async run(query, ...args) {
    return (await remote("run", query, args)).result as RunResult;
  },
};

export const sql: Sql = typeof process !== "undefined" && process.env?.HQ_URL && process.env?.HQ_SECRET ? httpSql : d1Sql;

/** Used by the internal endpoint to execute a runner's query on D1. */
export const sqlOnD1 = d1Sql;

// ---------- row mappers ----------

export type Row = Record<string, unknown>;
const arr = <T = string>(v: unknown): T[] => {
  try {
    const p = JSON.parse(String(v ?? "[]"));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

const obj = <T,>(v: unknown): T | null => {
  try {
    return v ? (JSON.parse(String(v)) as T) : null;
  } catch {
    return null;
  }
};

export function toAccount(r: Row): Account {
  return {
    ...(r as unknown as Account),
    platforms: arr(r.platforms),
    tones: arr(r.tones),
    formats: arr(r.formats),
    video_styles: arr(r.video_styles),
    brand_colors: arr(r.brand_colors),
    art_styles: arr(r.art_styles),
    strategy: obj(r.strategy),
  };
}

export function toContent(r: Row): ContentItem {
  return {
    ...(r as unknown as ContentItem),
    script: arr(r.script),
    slides: arr(r.slides),
    hashtags: arr(r.hashtags),
    production: obj(r.production),
    media: obj(r.media),
  };
}

const where = (parts: [boolean, string, ...Arg[]][]) => {
  const used = parts.filter((p) => p[0]);
  return {
    clause: used.length ? "WHERE " + used.map((p) => p[1]).join(" AND ") : "",
    args: used.flatMap((p) => p.slice(2) as Arg[]),
  };
};

// ---------- queries ----------

export const q = {
  async accounts(): Promise<Account[]> {
    return (await sql.all("SELECT * FROM accounts ORDER BY id")).map(toAccount);
  },
  async account(id: number): Promise<Account | null> {
    const r = await sql.get("SELECT * FROM accounts WHERE id = ?", id);
    return r ? toAccount(r) : null;
  },
  async trends(opts: { accountId?: number; status?: string; limit?: number } = {}): Promise<Trend[]> {
    const w = where([
      [!!opts.accountId, "account_id = ?", opts.accountId],
      [!!opts.status, "status = ?", opts.status],
    ]);
    return sql.all<Trend>(
      `SELECT * FROM trends ${w.clause} ORDER BY date(created_at) DESC, fit_score DESC, id DESC LIMIT ${opts.limit ?? 200}`,
      ...w.args,
    );
  },
  async trend(id: number): Promise<Trend | null> {
    return sql.get<Trend>("SELECT * FROM trends WHERE id = ?", id);
  },
  async content(opts: { accountId?: number; status?: string; limit?: number } = {}): Promise<ContentItem[]> {
    const w = where([
      [!!opts.accountId, "account_id = ?", opts.accountId],
      [!!opts.status, "status = ?", opts.status],
    ]);
    return (await sql.all(`SELECT * FROM content ${w.clause} ORDER BY planned_date IS NULL, planned_date, id LIMIT ${opts.limit ?? 300}`, ...w.args)).map(
      toContent,
    );
  },
  async contentItem(id: number): Promise<ContentItem | null> {
    const r = await sql.get("SELECT * FROM content WHERE id = ?", id);
    return r ? toContent(r) : null;
  },
  async jobs(opts: { accountId?: number; limit?: number } = {}): Promise<Job[]> {
    return opts.accountId
      ? sql.all<Job>(`SELECT * FROM jobs WHERE account_id = ? ORDER BY id DESC LIMIT ${opts.limit ?? 50}`, opts.accountId)
      : sql.all<Job>(`SELECT * FROM jobs ORDER BY id DESC LIMIT ${opts.limit ?? 50}`);
  },
  async job(id: number): Promise<Job | null> {
    return sql.get<Job>("SELECT * FROM jobs WHERE id = ?", id);
  },
  async activeJobs(): Promise<Job[]> {
    return sql.all<Job>("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id");
  },
  async setting(key: string, fallback: string): Promise<string> {
    const r = await sql.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
    return r?.value ?? fallback;
  },
  async setSetting(key: string, value: string) {
    await sql.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  },
  async posts(opts: { accountId?: number; from?: string; to?: string; statuses?: string[]; method?: string } = {}): Promise<Post[]> {
    const w = where([
      [!!opts.accountId, "account_id = ?", opts.accountId],
      [!!opts.from, "scheduled_at >= ?", opts.from],
      [!!opts.to, "scheduled_at < ?", opts.to],
      [!!opts.method, "method = ?", opts.method],
      [!!opts.statuses?.length, `status IN (${(opts.statuses ?? []).map(() => "?").join(",")})`, ...(opts.statuses ?? [])],
    ]);
    return sql.all<Post>(`SELECT * FROM posts ${w.clause} ORDER BY scheduled_at, id LIMIT 500`, ...w.args);
  },
  async postsFor(contentId: number): Promise<Post[]> {
    return sql.all<Post>("SELECT * FROM posts WHERE content_id = ? ORDER BY platform", contentId);
  },
  async post(id: number): Promise<Post | null> {
    return sql.get<Post>("SELECT * FROM posts WHERE id = ?", id);
  },
  async connection(accountId: number, platform: string): Promise<Connection | null> {
    return sql.get<Connection>("SELECT * FROM connections WHERE account_id = ? AND platform = ?", accountId, platform);
  },
  async counts(accountId: number) {
    const r = await sql.get<{ newTrends: number; scripted: number; approved: number; posted: number }>(
      `SELECT
        (SELECT COUNT(*) FROM trends WHERE account_id = ?1 AND status = 'new') AS newTrends,
        (SELECT COUNT(*) FROM content WHERE account_id = ?1 AND status = 'scripted') AS scripted,
        (SELECT COUNT(*) FROM content WHERE account_id = ?1 AND status = 'approved') AS approved,
        (SELECT COUNT(*) FROM content WHERE account_id = ?1 AND status = 'posted') AS posted`,
      accountId,
    );
    return r ?? { newTrends: 0, scripted: 0, approved: 0, posted: 0 };
  },
};
