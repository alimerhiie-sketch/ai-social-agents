import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { AccountForm } from "@/components/account-form";
import { SubmitButton } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { deleteAccount, updateAccount } from "../../../actions";

export default async function EditAccount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = q.account(Number(id));
  if (!a) notFound();
  return (
    <>
      <PageHeader eyebrow={a.name} title="Edit profile" />
      <AccountForm account={a} action={updateAccount.bind(null, a.id)} submitLabel="Save changes" />
      <form action={deleteAccount.bind(null, a.id)} className="mt-16 flex items-center justify-between gap-4 rounded-xl border border-bad/20 p-4">
        <span className="text-sm text-muted">Delete this account with all its trends, scripts and runs.</span>
        <SubmitButton className="btn btn-danger btn-sm" pending="Deleting…">
          Delete account
        </SubmitButton>
      </form>
    </>
  );
}
