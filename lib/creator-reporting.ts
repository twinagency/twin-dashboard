// Server-only entry point. Client components import the contract with `import type`.
import { cookies } from 'next/headers';
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from './creator-session';
import { serviceClient } from './supabase-service';
import { withDashboardAccess } from './dashboard-access';
import { getRevenueRollup } from './revenue-cache';
import { reportDayStartMs, shiftReportDay } from './revenue-why-changed';
import {
  CreatorReportError, creatorReportingScope, projectCreatorReport,
  readableCreatorAccount, validCreatorId, validRevenueShare,
  type CreatorReportIdentity, type CreatorReportQuery, type CreatorReportResponse,
} from './creator-report-contract';

/** Re-resolve ownership for EVERY request, including exports and cache hits. */
export async function requireCreatorReportIdentity(): Promise<CreatorReportIdentity> {
  let session;
  try { session = await verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value); }
  catch { throw new CreatorReportError(401, 'Please sign in to your creator account.'); }
  if (!session || !validCreatorId(session.accountId) || !validCreatorId(session.userId)) {
    throw new CreatorReportError(401, 'Please sign in to your creator account.');
  }
  // This bootstrap read is explicit and narrow. An unrelated agency/admin
  // cookie must not pick the creator or influence its reporting scope.
  const db = serviceClient();
  const account = await db.from('creator_accounts').select('id,auth_user_id,display_name,account_status')
    .eq('id', session.accountId).eq('auth_user_id', session.userId).maybeSingle();
  if (account.error) throw new CreatorReportError(503, 'Creator access is temporarily unavailable.');
  if (!account.data) throw new CreatorReportError(401, 'Please sign in to your creator account.');
  if (!readableCreatorAccount(account.data.account_status)) throw new CreatorReportError(403, 'This creator account does not have reporting access.');
  const [link, application] = await Promise.all([
    db.from('creator_clone_links').select('clone_id,revenue_share_percent').eq('creator_account_id', session.accountId).maybeSingle(),
    db.from('creator_applications').select('status').eq('creator_account_id', session.accountId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (link.error || application.error) throw new CreatorReportError(503, 'Creator access is temporarily unavailable.');
  const cloneId = link.data?.clone_id || null;
  if (cloneId && !validCreatorId(cloneId)) throw new CreatorReportError(403, 'Creator access is unavailable.');
  let cloneName: string | null = null;
  if (cloneId) {
    const clone = await db.from('clones').select('id,name').eq('id', cloneId).maybeSingle();
    if (clone.error || !clone.data) throw new CreatorReportError(503, 'Your clone connection is temporarily unavailable.');
    cloneName = clone.data.name;
  }
  return {
    accountId: session.accountId, userId: session.userId,
    displayName: account.data.display_name || 'Creator', accountStatus: account.data.account_status,
    cloneId, cloneName, revenueSharePercent: validRevenueShare(link.data?.revenue_share_percent),
    onboardingComplete: ['submitted', 'reviewing', 'approved'].includes(application.data?.status || ''),
  };
}

export async function loadCreatorReport(identity: CreatorReportIdentity, query: CreatorReportQuery): Promise<CreatorReportResponse> {
  if (!identity.cloneId) return { state: 'awaiting_connection', report: null };
  const scope = creatorReportingScope(identity);
  const range = query.startDate && query.endDate ? {
    startMs: reportDayStartMs(query.startDate), endMs: reportDayStartMs(shiftReportDay(query.endDate, 1)) - 1,
  } : undefined;
  // Reuse the operator reporting engine, existing scoped SQL/RPC guards and
  // one-minute cache. Only this request-local callback receives the restricted
  // reporting identity; onboarding and admin/agency authentication are unchanged.
  const raw = await withDashboardAccess(scope, () =>
    getRevenueRollup(query.period, identity.cloneId, range, { awaitFresh: true }),
  );
  return { state: 'ready', report: projectCreatorReport(raw, identity) };
}
