import { redirect } from 'next/navigation';
import CreatorPortalShell from '@/components/CreatorPortalShell';
import { requireCreatorReportIdentity } from '@/lib/creator-reporting';
import { CreatorReportError } from '@/lib/creator-report-contract';
import { serviceClient } from '@/lib/supabase-service';
import { CREATOR_QUESTIONNAIRE_SECTIONS } from '@/lib/creator-questionnaire';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Onboarding · LYNQ Creator' };

export default async function CreatorOnboardingViewPage() {
  let identity;
  try { identity = await requireCreatorReportIdentity(); }
  catch (error) {
    if (error instanceof CreatorReportError && error.status === 401) redirect('/creator/login');
    throw error;
  }
  const db = serviceClient();
  const { data: application } = await db.from('creator_applications').select('status,answers,created_at').eq('creator_account_id', identity.accountId).order('created_at',{ascending:false}).limit(1).maybeSingle();
  const answers = (application?.answers || {}) as Record<string,string>;
  const name = identity.cloneName || identity.displayName;

  return <CreatorPortalShell displayName={name}><main className="earnings-aurora min-h-screen px-4 py-8 sm:px-7"><div className="mx-auto max-w-[1200px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-[-0.04em]">Onboarding</h1><p className="mt-2 text-sm text-[#747580]">Review the information you submitted during onboarding.</p></div><a href="/creator/onboarding" className="rounded-full border border-[#d9dae5] bg-white px-4 py-2 text-sm font-semibold text-[#304bf4] shadow-sm">Update onboarding</a></div><div className="mt-7 grid gap-4">{CREATOR_QUESTIONNAIRE_SECTIONS.map(section=><section key={section.title} className="rounded-2xl border border-[#dddde7] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">{section.title}</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{section.questions.map(q=><div key={q.id} className={q.type==='textarea'||q.type==='radio'?'md:col-span-2':''}><div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#777884]">{q.label}</div><div className="mt-2 whitespace-pre-wrap text-sm text-[#25262c]">{answers[q.id] || 'Not provided'}</div></div>)}</div></section>)}</div></div></main></CreatorPortalShell>;
}
