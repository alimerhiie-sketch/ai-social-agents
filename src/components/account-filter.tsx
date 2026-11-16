import Link from "next/link";
import type { Account } from "@/lib/types";

/** Pill row to filter a page by account, via ?account=ID (plus any extra params). */
export function AccountFilter({ accounts, current, base, extra = "" }: { accounts: Account[]; current?: number; base: string; extra?: string }) {
  if (accounts.length < 2) return null;
  const pill = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${active ? "border-line-2 bg-panel-2 text-fg" : "border-transparent text-muted hover:text-fg"}`;
  return (
    <div className="mb-6 flex flex-wrap gap-1">
      <Link href={`${base}${extra ? `?${extra}` : ""}`} className={pill(!current)}>
        All accounts
      </Link>
      {accounts.map((a) => (
        <Link key={a.id} href={`${base}?account=${a.id}${extra ? `&${extra}` : ""}`} className={pill(current === a.id)}>
          {a.name}
        </Link>
      ))}
    </div>
  );
}
