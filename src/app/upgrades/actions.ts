"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { enqueue, wakeRunner } from "@/lib/queue";
import { sanitize } from "@/lib/agents/upgrades";

// Upgrade proposals from the Agent Developer. Nothing reaches an agent until it is approved here.

const s = (fd: FormData | undefined, k: string) => String(fd?.get(k) ?? "").trim();

export async function runAgentDeveloper(accountId: number) {
  await requireAuth();
  const id = await enqueue("develop", accountId);
  await wakeRunner("agent developer").catch(() => "");
  revalidatePath("/", "layout");
  redirect(`/agents/jobs/${id}`);
}

/** Approve, optionally with your edits to the new text (filtered again, so an edit can't smuggle anything in). */
export async function approveUpgrade(id: number, fd: FormData) {
  await requireAuth();
  const edited = s(fd, "after_text");
  const current = await sql.get<{ after_text: string; safety_notes: string }>("SELECT after_text, safety_notes FROM agent_upgrades WHERE id = ? AND status = 'pending'", id);
  if (!current) return;
  let text = current.after_text;
  let notes = current.safety_notes;
  if (edited && edited !== current.after_text) {
    const clean = sanitize(edited);
    if (clean.text.length < 20) throw new Error("The edited text is empty after the safety filter");
    text = clean.text;
    notes = [notes, "Edited by you before approval.", clean.flags.length ? `Removed from your edit: ${clean.flags.join(", ")}.` : ""].filter(Boolean).join(" ");
  }
  await sql.run(
    `UPDATE agent_upgrades SET status = 'approved', after_text = ?, safety_notes = ?, decision_note = ?, decided_at = datetime('now'), applied_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    text,
    notes,
    s(fd, "note"),
    id,
  );
  revalidatePath("/upgrades");
}

export async function rejectUpgrade(id: number, fd: FormData) {
  await requireAuth();
  await sql.run(
    "UPDATE agent_upgrades SET status = 'rejected', decision_note = ?, decided_at = datetime('now') WHERE id = ? AND status IN ('pending','blocked')",
    s(fd, "note"),
    id,
  );
  revalidatePath("/upgrades");
}

/** Stop sending an approved upgrade. Its history stays, so the Agent Developer can see it was taken back. */
export async function revokeUpgrade(id: number, fd?: FormData) {
  await requireAuth();
  await sql.run(
    "UPDATE agent_upgrades SET status = 'revoked', revoked_at = datetime('now'), decision_note = CASE WHEN ? != '' THEN ? ELSE decision_note END WHERE id = ? AND status = 'approved'",
    s(fd, "note"),
    s(fd, "note"),
    id,
  );
  revalidatePath("/upgrades");
}
