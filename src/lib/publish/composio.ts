// Instagram publishing through Composio's managed Instagram connection (free plan). Composio holds the
// OAuth token and refreshes it; we only need the Worker secret COMPOSIO_API_KEY plus the connected
// account stored in `connections`. Same two-phase flow as the Graph helpers in instagram.ts: create a
// container now, check it and publish on a later cron tick.
//
// Two kinds of key:
//  - `ck_…` Composio Connect consumer key (the only key a Connect workspace has). It works only on the
//    Connect MCP endpoint, so we speak MCP (JSON-RPC over streamable HTTP) and run the Instagram tools
//    through COMPOSIO_MULTI_EXECUTE_TOOL. The account is the Connect account id (e.g. instagram_xxx).
//  - `ak_…` developer project key: the REST API, account = connected account id (ca_…) + user id.

import { env } from "../queue";
import type { IgMedia } from "./instagram";

const API = "https://backend.composio.dev/api/v3.1";

export type ComposioConn = { connectedAccountId: string; userId: string; igUserId: string };

type Json = Record<string, unknown>;

async function apiKey(): Promise<string> {
  const k = (await env()).COMPOSIO_API_KEY;
  if (!k) throw new Error("COMPOSIO_API_KEY is not set on the Worker (npx wrangler secret put COMPOSIO_API_KEY)");
  return k;
}

async function api(method: "GET" | "POST", path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "x-api-key": await apiKey(), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const e = (j.error ?? {}) as { message?: string };
    throw new Error(`Composio ${res.status}: ${e.message ?? res.statusText}`);
  }
  return j;
}

// ---------------------------------------------------------------------------
// Connect MCP client (ck_ keys)

const MCP = "https://connect.composio.dev/mcp";
const PROTOCOL = "2025-06-18";

async function isConsumerKey() {
  return (await apiKey()).startsWith("ck_");
}

/** One JSON-RPC message; the reply may come as plain JSON or as a server-sent event stream. */
async function rpc(key: string, body: Json, sessionId?: string): Promise<{ sessionId?: string; msg: Json | null }> {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-consumer-api-key": key,
      "mcp-protocol-version": PROTOCOL,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Composio Connect ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  const sid = res.headers.get("mcp-session-id") ?? sessionId;
  if (!text.trim()) return { sessionId: sid, msg: null };
  if ((res.headers.get("content-type") ?? "").includes("event-stream")) {
    const msgs = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => {
        try {
          return JSON.parse(l.slice(5).trim()) as Json;
        } catch {
          return null;
        }
      })
      .filter((m): m is Json => !!m);
    return { sessionId: sid, msg: msgs.find((m) => m.id === body.id) ?? msgs.at(-1) ?? null };
  }
  return { sessionId: sid, msg: JSON.parse(text) as Json };
}

/** Calls one Connect meta-tool and returns its parsed JSON result. */
async function mcpTool(name: string, args: Json): Promise<Json> {
  const key = await apiKey();
  const init = await rpc(key, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "agent-hq", version: "1.0" } },
  });
  if (init.msg?.error) throw new Error(`Composio Connect: ${JSON.stringify(init.msg.error).slice(0, 300)}`);
  await rpc(key, { jsonrpc: "2.0", method: "notifications/initialized" }, init.sessionId);
  const r = await rpc(key, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, init.sessionId);
  if (!r.msg) throw new Error("Composio Connect: empty reply");
  if (r.msg.error) throw new Error(`Composio Connect: ${JSON.stringify(r.msg.error).slice(0, 300)}`);
  const result = (r.msg.result ?? {}) as { content?: { type: string; text?: string }[]; isError?: boolean };
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  if (result.isError) throw new Error(`Composio Connect (${name}): ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error(`Composio Connect (${name}): unexpected reply ${text.slice(0, 200)}`);
  }
}

/** Runs one Composio tool. Throws with the tool's own error message when it fails. */
export async function run(conn: ComposioConn, slug: string, args: Json): Promise<Json> {
  if (await isConsumerKey()) {
    const outer = await mcpTool("COMPOSIO_MULTI_EXECUTE_TOOL", {
      tools: [{ tool_slug: slug, arguments: args, account: conn.connectedAccountId }],
      sync_response_to_workbench: false,
      thought: "Agent HQ: scheduled Instagram post approved by the owner",
      current_step: slug,
    });
    if (!outer.successful) throw new Error(`Instagram (${slug}): ${errText(outer.error)}`);
    const item = (((outer.data ?? {}) as Json).results as Json[] | undefined)?.[0] ?? {};
    const resp = (item.response ?? {}) as Json;
    if (!resp.successful) throw new Error(`Instagram (${slug}): ${errText(resp.error ?? item.error)}`);
    return (resp.data ?? {}) as Json;
  }
  const j = await api("POST", `/tools/execute/${slug}`, {
    connected_account_id: conn.connectedAccountId,
    user_id: conn.userId,
    version: "latest",
    arguments: args,
  });
  if (!j.successful) throw new Error(`Instagram (${slug}): ${errText(j.error)}`);
  return (j.data ?? {}) as Json;
}

const errText = (e: unknown) => (e == null ? "failed" : typeof e === "string" ? e : JSON.stringify(e)).slice(0, 400);

/** Tools wrap Graph responses a little differently; find the `id` wherever it is. */
function pickId(data: Json): string {
  const seen = new Set<unknown>();
  const walk = (v: unknown): string => {
    if (!v || typeof v !== "object" || seen.has(v)) return "";
    seen.add(v);
    const o = v as Json;
    if (typeof o.id === "string" || typeof o.id === "number") return String(o.id);
    for (const k of ["response_data", "data", "result", "response"]) {
      const r = walk(o[k]);
      if (r) return r;
    }
    return "";
  };
  const id = walk(data);
  if (!id) throw new Error(`Instagram: no id in Composio's response (${JSON.stringify(data).slice(0, 200)})`);
  return id;
}

export function pickField(data: Json, field: string): string {
  const stack: unknown[] = [data];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object") continue;
    const o = v as Json;
    if (o[field] != null && typeof o[field] !== "object") return String(o[field]);
    stack.push(...Object.values(o));
  }
  return "";
}

/** First value stored under `field` anywhere in the response (breadth-first, any type). */
export function pickAny(data: unknown, field: string): unknown {
  const queue: unknown[] = [data];
  while (queue.length) {
    const v = queue.shift();
    if (!v || typeof v !== "object") continue;
    const o = v as Json;
    if (field in o && o[field] != null) return o[field];
    queue.push(...Object.values(o));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Finding the connection

/** Active connected accounts for a toolkit (Connect account ids for ck_ keys, ca_… ids otherwise). */
export async function listConnections(toolkit: string): Promise<{ connectedAccountId: string; userId: string }[]> {
  if (await isConsumerKey()) {
    const j = await mcpTool("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: toolkit, action: "list" }] });
    const t = ((((j.data ?? {}) as Json).results ?? {}) as Json)[toolkit] as { accounts?: { id: string; status?: string }[] } | undefined;
    return (t?.accounts ?? []).filter((a) => (a.status ?? "").toUpperCase() === "ACTIVE").map((a) => ({ connectedAccountId: a.id, userId: "" }));
  }
  const j = await api("GET", `/connected_accounts?toolkit_slugs=${encodeURIComponent(toolkit)}&statuses=ACTIVE&limit=50`);
  return ((j.items ?? []) as { id: string; user_id: string }[]).map((i) => ({ connectedAccountId: i.id, userId: i.user_id }));
}

/** Active Instagram connections in the Composio project, with the IG account each one posts as. */
export async function findInstagramConnections(): Promise<(ComposioConn & { username: string })[]> {
  let items: { id: string; user_id: string; status?: string }[];
  if (await isConsumerKey()) {
    const j = await mcpTool("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "instagram", action: "list" }] });
    const ig = ((((j.data ?? {}) as Json).results ?? {}) as Json).instagram as { accounts?: { id: string; status?: string }[] } | undefined;
    items = (ig?.accounts ?? []).map((a) => ({ id: a.id, user_id: "", status: a.status?.toUpperCase() }));
  } else {
    const j = await api("GET", "/connected_accounts?toolkit_slugs=instagram&statuses=ACTIVE&limit=50");
    items = (j.items ?? []) as { id: string; user_id: string; status?: string }[];
  }
  const out: (ComposioConn & { username: string })[] = [];
  for (const it of items) {
    if (it.status && it.status !== "ACTIVE") continue;
    const conn = { connectedAccountId: it.id, userId: it.user_id, igUserId: "" };
    try {
      const me = await run(conn, "INSTAGRAM_GET_USER_INFO", { ig_user_id: "me", fields: "id,user_id,username,account_type" });
      out.push({ ...conn, igUserId: pickField(me, "user_id") || pickField(me, "id"), username: pickField(me, "username") });
    } catch {
      out.push({ ...conn, username: "" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Two-phase publishing

/** Starts processing; returns the container id to check on a later tick. */
export async function createContainer(conn: ComposioConn, media: IgMedia, caption: string): Promise<string> {
  const ig_user_id = conn.igUserId;
  if (media.kind === "reel")
    return pickId(
      await run(conn, "INSTAGRAM_POST_IG_USER_MEDIA", {
        ig_user_id,
        media_type: "REELS",
        video_url: media.video,
        caption,
        share_to_feed: true,
        ...(media.cover ? { cover_url: media.cover } : {}),
      }),
    );
  if (media.kind === "image") return pickId(await run(conn, "INSTAGRAM_POST_IG_USER_MEDIA", { ig_user_id, image_url: media.image, caption }));
  // One call: Composio creates the slide containers and the carousel parent.
  return pickId(
    await run(conn, "INSTAGRAM_CREATE_CAROUSEL_CONTAINER", { ig_user_id, child_image_urls: media.images.slice(0, 10), caption }),
  );
}

/** FINISHED, IN_PROGRESS, ERROR, EXPIRED or PUBLISHED. */
export async function containerStatus(conn: ComposioConn, containerId: string): Promise<{ code: string; detail: string }> {
  const d = await run(conn, "INSTAGRAM_GET_POST_STATUS", { creation_id: containerId });
  return { code: pickField(d, "status_code"), detail: pickField(d, "status") };
}

export async function publishContainer(conn: ComposioConn, containerId: string) {
  // Already FINISHED when we get here, so Composio doesn't need to wait long.
  const d = await run(conn, "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", { ig_user_id: conn.igUserId, creation_id: containerId, max_wait_seconds: 20 });
  const mediaId = pickId(d);
  let permalink = "";
  try {
    permalink = pickField(await run(conn, "INSTAGRAM_GET_IG_MEDIA", { ig_media_id: mediaId, fields: "id,permalink" }), "permalink");
  } catch {}
  return { mediaId, permalink };
}
