"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight, CheckCircle2, FileText, Images, RefreshCw, ShieldCheck } from "lucide-react";
import { preparationProgress, type CreatorPreparation as Preparation } from "@/lib/creator-preparation-model";

export default function CreatorPreparation({ value }: { value: Preparation }) {
  const progress = preparationProgress(value), router = useRouter();
  const [refreshing, refresh] = useTransition();
  const { photos, videos, pending, folders } = value.content;
  const cards = [
    { key: "profile", title: "Your profile", icon: FileText, saved: progress.profileSaved, detail: value.profile.answered === null ? "Your saved profile could not be checked." : `${value.profile.answered} of ${value.profile.total} profile answers saved. Add your personality, preferences and boundaries.`, href: "/creator/onboarding?step=questionnaire", action: "Review profile" },
    { key: "content", title: "Your content", icon: Images, saved: progress.contentSaved && !progress.needsContentReview, detail: photos === null || videos === null ? "Your saved uploads could not be checked." : `${photos} photos and ${videos} videos verified in your saved uploads.${pending ? ` ${pending} uploads still need checking.` : ""}${folders ? ` ${folders} folder links provided; your team can confirm their import status.` : ""}`, href: "/creator/onboarding?step=content", action: "Open saved content" },
    { key: "permission", title: "Your permission", icon: ShieldCheck, saved: value.consentSaved === true, detail: value.consentSaved === null ? "Your saved permission could not be checked." : value.consentSaved ? "Your creator consent is recorded. Platform connection is a separate step." : "Review the permission for your creator profile and content when you’re ready.", href: "/creator/onboarding?review=1", action: "Review permission" },
  ];
  return <section aria-label="Creator preparation" className="mb-6 rounded-2xl border border-line bg-panel p-4 sm:p-6" data-creator-preparation>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-ink">Get ready at your own pace.</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Save your profile and content now. You can connect OnlyFans later.</p></div>
      <button type="button" onClick={() => refresh(() => router.refresh())} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-50"><RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />{refreshing ? "Checking…" : "Check progress"}</button>
    </div>
    {progress.unavailable && <p role="status" className="mt-3 text-sm text-muted">Some preparation details are unavailable. Your saved work is unchanged. Try checking progress again.</p>}
    <div className="mt-5 grid gap-3 lg:grid-cols-3">{cards.map(({ key, title, icon: Icon, saved, detail, href, action }) => <article key={key} className="flex min-w-0 flex-col rounded-xl border border-line p-4" data-preparation-step={key} data-saved={saved}>
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold text-ink"><Icon size={18} className="shrink-0 text-accent" />{title}</h3>{saved && <CheckCircle2 size={18} className="shrink-0 text-emerald-700" aria-label="Saved" />}</div>
      <p className="mb-3 mt-2 flex-1 text-sm leading-6 text-muted">{detail}</p><Link href={href} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">{action}<ArrowRight size={15} /></Link>
    </article>)}</div>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4"><p className="max-w-2xl text-sm leading-6 text-muted">Next: connect your account, then review the OnlyFans catalogue and prices with your agency. Saved Twin uploads are separate from your OnlyFans vault.</p><Link href="/creator/platforms" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">My platforms<ArrowRight size={15} /></Link></div>
  </section>;
}
