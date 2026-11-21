"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { wakeRunner } from "@/lib/queue";
import { collectMetrics } from "@/lib/analytics/collect";
import { enqueueWeeklyReview } from "@/lib/analytics/review";

/** Analyst now, then the Manager's brief (normally Sunday night). */
export async function runReview(accountId: number) {
  await requireAuth();
  const [id] = await enqueueWeeklyReview(accountId, true);
  await wakeRunner("weekly review").catch(() => "");
  revalidatePath("/", "layout");
  redirect(`/agents/jobs/${id}`);
}

/** Read whatever insights are due right now, plus today's account snapshot if it's missing. */
export async function refreshInsights() {
  await requireAuth();
  await collectMetrics();
  revalidatePath("/analytics");
}
