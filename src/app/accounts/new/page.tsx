import { AccountForm } from "@/components/account-form";
import { PageHeader } from "@/components/ui";
import { createAccount } from "../../actions";

export default async function NewAccount() {
  return (
    <>
      <PageHeader eyebrow="Accounts" title="New account">
        Describe the account and choose what kind of content it makes. You can change all of this later.
      </PageHeader>
      <AccountForm action={createAccount} submitLabel="Create account" />
    </>
  );
}
