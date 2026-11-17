import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { COOKIE, isAuthed } from "@/lib/auth";
import { readLog } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed((await cookies()).get(COOKIE)?.value))) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const job = await q.job(Number(id));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ job, log: await readLog(job.id) });
}
