import { q } from "@/lib/db";
import { readLog } from "@/lib/agents/runner";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = q.job(Number(id));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ job, log: readLog(job.id) });
}
