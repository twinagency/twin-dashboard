import { redirect } from 'next/navigation';
import CreatorPortalShell from '@/components/CreatorPortalShell';
import { requireCreatorReportIdentity } from '@/lib/creator-reporting';
import { CreatorReportError } from '@/lib/creator-report-contract';
import { serviceClient } from '@/lib/supabase-service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile · LYNQ Creator' };

export default async function CreatorProfilePage() {
  let identity;
  try { identity = await requireCreatorReportIdentity(); }
  catch (error) {
    if (error instanceof CreatorReportError && error.status === 401) redirect('/creator/login');
    throw error;
  }
  const db = serviceClient();
  const { data: account } = await db.from('creator_accounts').select('display_name,email,account_status').eq('id', identity.accountId).maybeSingle();
  const name = identity.cloneName || identity.displayName;
  return <CreatorPortalShell displayName={name}><main className="earnings-aurora min-h-screen px-4 py-8 sm:px-7"><div className="mx-auto max-w-[900px]"><h1 className="text-3xl font-semibold tracking-[-0.04em]">Profile</h1><p className="mt-2 text-sm text-[#747580]">Manage your creator account and sign-in settings.</p><div className="mt-7 grid gap-4"><section className="rounded-2xl border border-[#dddde7] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Account details</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#777884]">Display name</div><div className="mt-2 text-sm">{account?.display_name || identity.displayName}</div></div><div><div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#777884]">Email</div><div className="mt-2 text-sm">{account?.email || 'Not available'}</div></div><div><div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#777884]">Creator</div><div className="mt-2 text-sm">{identity.cloneName || 'Awaiting connection'}</div></div><div><div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#777884]">Status</div><div className="mt-2 text-sm capitalize">{account?.account_status || identity.accountStatus}</div></div></div></section><section className="rounded-2xl border border-[#dddde7] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Password</h2><p className="mt-2 text-sm text-[#747580]">Use the secure password reset flow to change your sign-in password.</p><a href="/creator/forgot-password" className="mt-4 inline-flex rounded-xl bg-[#304bf4] px-4 py-2.5 text-sm font-semibold text-white">Change password</a></section><section className="rounded-2xl border border-[#dddde7] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Session</h2><form action="/creator-auth/logout" method="post"><button className="mt-4 rounded-xl border border-[#d9dae5] bg-white px-4 py-2.5 text-sm font-semibold">Sign out</button></form></section></div></div></main></CreatorPortalShell>;
}
