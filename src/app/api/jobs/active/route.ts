import { q } from "@/lib/db";
import { JOB_KINDS } from "@/lib/agents/registry";
import "@/lib/agents/runner"; // make sure the queue is booted

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = q.activeJobs().map((j) => ({
    id: j.id,
    status: j.status,
    verb: JOB_KINDS[j.kind]?.verb ?? j.kind,
    account: j.account_id ? q.account(j.account_id)?.name : null,
    notBefore: j.not_before ?? null,
  }));
  return Response.json({ jobs });
}
