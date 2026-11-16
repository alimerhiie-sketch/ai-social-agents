import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { agentById, JOB_KINDS } from "@/lib/agents/registry";
import { readLog } from "@/lib/agents/runner";
import { cancelJob } from "../../../actions";
import { JobWatcher, SubmitButton } from "@/components/client";
import { duration, JobStatusBadge, PageHeader, TextLink, timeAgo } from "@/components/ui";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = q.job(Number(id));
  if (!job) notFound();
  const account = job.account_id ? q.account(job.account_id) : null;
  const agent = agentById(job.agent);
  const resultHref =
    job.kind === "trends"
      ? `/trends?account=${job.account_id}`
      : job.kind === "strategy"
        ? `/accounts/${job.account_id}`
        : `/pipeline?account=${job.account_id}`;

  return (
    <>
      <div className="mb-4 text-[13px]">
        <TextLink href="/agents">← All runs</TextLink>
      </div>
      <PageHeader
        eyebrow={`${agent?.name ?? job.agent} · run #${job.id}`}
        title={`${JOB_KINDS[job.kind]?.label}${account ? ` — ${account.name}` : ""}`}
        actions={
          (job.status === "running" || job.status === "queued") && (
            <form action={cancelJob.bind(null, job.id)}>
              <SubmitButton className="btn btn-ghost" pending="Cancelling…">
                Cancel run
              </SubmitButton>
            </form>
          )
        }
      >
        <span className="flex flex-wrap items-center gap-3 text-xs">
          <JobStatusBadge status={job.status} />
          <span>model {job.model ?? "—"}</span>
          <span>started {timeAgo(job.started_at ?? job.created_at)}</span>
          {job.duration_ms && <span>took {duration(job.duration_ms)}</span>}
        </span>
      </PageHeader>
      <JobWatcher jobId={job.id} initial={{ job, log: readLog(job.id) }} resultHref={resultHref} />
    </>
  );
}
