import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { COOKIE, isAuthed } from "@/lib/auth";
import { JOB_KINDS } from "@/lib/agents/registry";
import { runnerAlive } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed((await cookies()).get(COOKIE)?.value))) return new Response("Unauthorized", { status: 401 });
  const names = new Map((await q.accounts()).map((a) => [a.id, a.name]));
  const jobs = (await q.activeJobs()).map((j) => ({
    id: j.id,
    status: j.status,
    verb: JOB_KINDS[j.kind]?.verb ?? j.kind,
    account: j.account_id ? (names.get(j.account_id) ?? null) : null,
    notBefore: j.not_before ?? null,
  }));
  return Response.json({ jobs, runner: await runnerAlive() });
}
