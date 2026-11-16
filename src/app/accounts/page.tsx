import Link from "next/link";
import { q } from "@/lib/db";
import { Badge, Empty, PageHeader } from "@/components/ui";

export default function Accounts() {
  const accounts = q.accounts();
  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Accounts"
        actions={
          <Link href="/accounts/new" className="btn btn-primary">
            New account
          </Link>
        }
      >
        One profile per brand. Create the actual Instagram and TikTok accounts yourself, then add the handles here.
      </PageHeader>
      {accounts.length === 0 ? (
        <Empty title="No accounts yet" action={<Link href="/accounts/new" className="btn btn-primary">Create one</Link>} />
      ) : (
        <div className="panel divide-y divide-line">
          {accounts.map((a) => (
            <Link key={a.id} href={`/accounts/${a.id}`} className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-panel-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{a.name}</div>
                <div className="truncate text-sm text-muted">{a.niche}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.platforms.map((p) => (
                  <Badge key={p} tone="info">{p === "instagram" ? "IG" : "TikTok"}</Badge>
                ))}
                <Badge>{a.language}</Badge>
                {a.strategy ? <Badge tone="good">Strategy</Badge> : <Badge tone="warn">No strategy</Badge>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
