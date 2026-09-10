import { redirect } from 'next/navigation';
import CreatorRevenueDashboard from '@/components/CreatorRevenueDashboard';
import TwinWordmark from '@/components/TwinWordmark';
import { requireCreatorReportIdentity } from '@/lib/creator-reporting';
import { CreatorReportError } from '@/lib/creator-report-contract';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Creator Dashboard · Twin', robots: { index: false, follow: false } };

export default async function CreatorHomePage() {
  let identity;
  try { identity = await requireCreatorReportIdentity(); }
  catch (error) {
    if (error instanceof CreatorReportError && error.status === 401) redirect('/creator/login');
    return <main className="mx-auto max-w-xl px-5 py-12"><TwinWordmark /><h1 className="mt-8 font-heading text-2xl font-semibold">Creator dashboard unavailable</h1><p className="mt-3 text-muted">{error instanceof CreatorReportError && error.status === 403 ? 'This account does not currently have reporting access. Contact the Twin team.' : 'Your account or clone connection could not be loaded. Please try again.'}</p><div className="mt-6 flex gap-5"><a href="/creator" className="font-medium text-primary">Try again</a><a href="/creator/onboarding" className="font-medium text-primary">View onboarding</a><form action="/creator-auth/logout" method="post"><button className="font-medium text-primary">Sign out</button></form></div></main>;
  }
  // Never serialize account IDs, auth user IDs, raw clones or the operator payload.
  return <CreatorRevenueDashboard displayName={identity.displayName} cloneName={identity.cloneName}
    connected={!!identity.cloneId} onboardingComplete={identity.onboardingComplete} />;
}
