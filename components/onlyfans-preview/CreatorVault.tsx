import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import VaultManager from "./VaultManager";
import styles from "./OnlyFansStudio.module.css";

/** Reuse the creator's native vault; OnlyFans files stay in their existing store. */
export async function loadCreatorVault(creatorId: string) {
  if (requestId(creatorId) !== creatorId) return null;
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse || !ctx.backend) return null;
  const result = await ctx.backend.listAccounts({ creatorId });
  if (!result.ok) return <p role="status" className="text-sm text-muted">The OnlyFans media library could not be loaded. Open Content to check the connection.</p>;
  if (result.data.some(account => account.binding.creatorId !== creatorId)) return <p role="status" className="text-sm text-muted">The OnlyFans media library could not be verified for this creator.</p>;
  if (!result.data.length) return null;
  return <section className={`${styles.platform} ${styles.embedded}`} aria-label="OnlyFans media" data-creator-onlyfans-media={creatorId}>
    <header className="px-5 pt-5"><h2 className="text-lg font-semibold">OnlyFans media</h2><p className="mt-1 text-sm text-muted">This creator's imported photos, videos and categories.</p></header>
    {result.data.map(account => <section key={account.accountId} aria-label={`OnlyFans @${account.binding.handle}`}>
      <h3 className="px-5 pt-3 text-sm font-semibold">@{account.binding.handle}</h3>
      <VaultManager accountId={account.accountId} readOnly={!ctx.canManage} />
    </section>)}
  </section>;
}
