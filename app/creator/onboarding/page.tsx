import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import CreatorQuestionnaireWizard from "@/components/CreatorQuestionnaireWizard";
import CreatorUploadForm from "@/components/CreatorUploadForm";
import { SkipToDashboard } from "@/components/FlirtOnboardingLinks";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import {
  creatorQuestionnairePage,
  questionnairePageQuestions,
  questionnaireRequiredMissing,
} from "@/lib/creator-questionnaire-draft";
import {
  CREATOR_CONTENT_REQUIREMENTS,
  creatorContentCompleted,
  creatorContentCounts,
  creatorLegacyContentCount,
  type CreatorContentKind,
} from "@/lib/creator-content-requirements";
import { TETHER_PORTAL } from "@/lib/partner-portals";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "@/lib/creator-routing";
import { isLynq } from "@/lib/agency-brand";
import { creatorOnboardingEditable, creatorVoiceOnboardingEnabled, flirtOnboardingOptional } from "@/lib/flirt-onboarding";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Circle, FileText, Images, Mic2, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const statusCopy: Record<string,string> = {
  questionnaire_saved: "Questionnaire saved.",
  questionnaire_missing: "Complete the required questionnaire fields before continuing.",
  questionnaire_conflict: "Your questionnaire changed in another window. Refresh before continuing.",
  application_locked: "This application is locked and can no longer be changed.",
  content_saved: "Content uploaded and verified.",
  voice_saved: "Voice samples uploaded and verified.",
  voice_skipped: "Voice setup skipped for now. You can add it later.",
  consent_saved: "Consent saved.",
  consent_skipped: "Consent skipped. No consent has been recorded.",
  upload_empty: "Choose at least one file.",
  upload_too_many: "Upload up to 25 files at a time.",
  upload_too_large: "Videos can be up to 512 MiB, images up to 15 MiB, and voice recordings up to 64 MiB each. File size is separate from video length.",
  upload_busy: "Another upload is still being checked. Wait for it to finish, then try again.",
  upload_quota: "This account has reached its onboarding upload limit. Contact support before adding more files.",
  upload_video_too_long: "This video is longer than 30 minutes. Choose a shorter video.",
  upload_video_resolution: "This video is above 4K resolution. Export it at 4K or lower.",
  upload_interrupted: "The connection was interrupted. Please retry your upload.",
  upload_timeout: "The upload timed out. Check your connection and retry.",
  upload_wrong_type: "Use JPG, PNG, WebP or GIF for images, and MP4, MOV or WebM for videos. Upload each file to the matching category.",
  upload_error: "That upload did not finish. Review the verified-file count, then try the remaining files.",
  consent_missing: "Enter your legal name and confirm consent.",
  not_ready: "Finish the required onboarding steps before submitting.",
  error: "Something went wrong. Please try again.",
};

const errorStatuses = new Set(["questionnaire_missing", "questionnaire_conflict", "application_locked", "upload_empty", "upload_too_many", "upload_too_large", "upload_busy", "upload_quota", "upload_wrong_type", "upload_video_too_long", "upload_video_resolution", "upload_interrupted", "upload_timeout", "upload_error", "consent_missing", "not_ready", "error"]);
const onboardingSteps = ["questionnaire", "content", "voice", "consent"] as const;
type OnboardingStep = (typeof onboardingSteps)[number];

function isOnboardingStep(value: string | undefined): value is OnboardingStep {
  return onboardingSteps.includes(value as OnboardingStep);
}

function returnToOnboardingClass() {
  return buttonVariants({ variant: "outline", size: "lg", className: "min-h-11 w-full sm:w-auto" });
}

function CompletionMark({ complete, optional = false }: { complete: boolean; optional?: boolean }) {
  return complete ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="size-4" aria-hidden="true" /> Complete
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted">
      <Circle className="size-3.5" aria-hidden="true" /> {optional ? "Optional" : "Not complete"}
    </span>
  );
}

function StepCard({
  step,
  number,
  title,
  description,
  complete,
  optional = false,
  icon: Icon,
}: {
  step: OnboardingStep;
  number: number;
  title: string;
  description: string;
  complete: boolean;
  optional?: boolean;
  icon: typeof FileText;
}) {
  return (
    <Link
      href={`/creator/onboarding?step=${step}`}
      className="group rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      data-onboarding-step-card={step}
    >
      <Card className="h-full border border-border bg-white transition duration-200 group-hover:-translate-y-0.5 group-hover:border-accent/35 group-hover:shadow-[0_18px_50px_rgba(6,23,47,0.10)]">
        <CardHeader className="gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <CompletionMark complete={complete} optional={optional} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step {number}{optional ? " · Optional" : ""}</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
            {complete ? "Review" : "Open step"} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </CardHeader>
      </Card>
    </Link>
  );
}

function StepHeader({ number, title, complete, optional = false }: { number: number; title: string; complete: boolean; optional?: boolean }) {
  return (
    <CardHeader className="border-b border-border pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step {number}{optional ? " · Optional" : ""}</p>
          <h2 className="mt-1 font-heading text-3xl font-semibold text-ink">{title}</h2>
        </div>
        <CompletionMark complete={complete} optional={optional} />
      </div>
    </CardHeader>
  );
}

function SavedConfirmation({ title, detail }: { title: string; detail: string }) {
  return (
    <div id="step-result" role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check className="size-5" aria-hidden="true" /></span>
        <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-emerald-800">{detail}</p></div>
      </div>
    </div>
  );
}

function ReturnToOnboarding() {
  return <Link href="/creator/onboarding" className={returnToOnboardingClass()}><ArrowLeft className="size-4" aria-hidden="true" /> Return to onboarding</Link>;
}

function ContinueToStep({ step, children }: { step: OnboardingStep; children: string }) {
  return <Link href={`/creator/onboarding?step=${step}`} className={buttonVariants({ size: "lg", className: "min-h-11 w-full sm:w-auto" })} data-onboarding-continue={step}>{children}</Link>;
}


function StepNavigation({ step, steps }: { step: OnboardingStep; steps: OnboardingStep[] }) {
  const index = steps.indexOf(step);
  const previous = steps[index - 1];
  const next = steps[index + 1];
  const labels = { questionnaire: "Questionnaire", content: "Content", voice: "Voice", consent: "Consent & submit" };
  return <nav aria-label="Onboarding step navigation" className="flex flex-col gap-3 sm:flex-row sm:justify-between">
    <a href={previous ? `/creator/onboarding?step=${previous}` : "/creator/onboarding"} className={returnToOnboardingClass()} data-onboarding-back={previous || "hub"}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Back{previous ? `: ${labels[previous]}` : " to onboarding"}
    </a>
    {next ? <a href={`/creator/onboarding?step=${next}`} className={buttonVariants({ size: "lg", className: "min-h-11 w-full sm:w-auto" })} data-onboarding-next={next}>
      Next: {labels[next]} <ChevronRight className="size-4" aria-hidden="true" />
    </a> : <a href="/creator" className={returnToOnboardingClass()}>Dashboard <ChevronRight className="size-4" aria-hidden="true" /></a>}
  </nav>;
}

function ContentUploadCard({ kind, count, minimum, label, accept, formatHint, complete, locked, accountId, loginPath, optional = false }: {
  kind: CreatorContentKind;
  count: number;
  minimum: number;
  label: string;
  accept: string;
  formatHint: string;
  complete: boolean;
  locked: boolean;
  optional?: boolean;
  accountId: string;
  loginPath: string;
}) {
  const percent = Math.min(100, Math.round((count / minimum) * 100));
  return (
    <section className="rounded-2xl border border-border bg-white p-5" data-content-category={kind}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">{label}</h3>
          <p className="mt-1 text-sm text-muted">{optional ? `${count} verified` : `${count} of ${minimum} verified`}</p>
        </div>
        {optional ? <span className="text-sm font-semibold text-muted">Optional</span> : complete ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 className="size-4" aria-hidden="true" /> Minimum reached</span> : <span className="text-sm font-semibold text-muted">{minimum - count} remaining</span>}
      </div>
      {!optional && <div className="mt-4 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label={`${label} upload progress`} aria-valuemin={0} aria-valuemax={minimum} aria-valuenow={Math.min(count, minimum)}>
        <div className={`h-full rounded-full transition-[width] ${complete ? "bg-emerald-600" : "bg-accent"}`} style={{ width: `${percent}%` }} />
      </div>}
      <CreatorUploadForm accountId={accountId} loginPath={loginPath} kind={kind} label={label} accept={accept} formatHint={formatHint} locked={locked} />
    </section>
  );
}

function ReadinessItem({ step, complete, title, detail, href, optional = false }: { step: OnboardingStep; complete: boolean; title: string; detail: string; href: string; optional?: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-white p-4" data-readiness-item={step}>
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700" : "bg-muted/20 text-muted"}`}>
        {complete ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink">{title}</p><span className={`text-xs font-semibold ${complete ? "text-emerald-700" : optional ? "text-muted" : "text-amber-700"}`}>{complete ? "Complete" : optional ? "Optional" : "Action needed"}</span></div>
        <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
        {!complete && <Link href={href} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent">Open step <ChevronRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </li>
  );
}

export default async function CreatorOnboardingPage({ searchParams }: { searchParams: Promise<{ status?: string; step?: string; section?: string }> }) {
  const jar = await cookies();
  const creator = await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator) redirect(creatorLoginPath(creator, jar.get(CREATOR_PORTAL_COOKIE)?.value));
  const session = { accountId: creator.accountId };
  const tether = creator.name === TETHER_PORTAL.name;
  const link = isLynq(creator.name);
  const brandName = tether ? "Tether" : link ? "LYNQ" : "Twin";
  const optional = flirtOnboardingOptional();
  const voiceEnabled = creatorVoiceOnboardingEnabled();
  const visibleSteps = onboardingSteps.filter((item) => item !== "voice" || voiceEnabled);
  const totalSteps = visibleSteps.length;
  const consentStepNumber = visibleSteps.indexOf("consent") + 1;
  const afterContent = voiceEnabled ? "voice" : "consent";
  const loginPath = creatorLoginPath(creator, jar.get(CREATOR_PORTAL_COOKIE)?.value);
  const { status, step, section } = await searchParams;
  if (step === "voice" && !voiceEnabled) redirect("/creator/onboarding?step=consent");
  const activeStep = isOnboardingStep(step) ? step : null;
  const questionnairePage = creatorQuestionnairePage(section);

  const [{ data: account }, { data: progress }, { data: application }, { data: files }, { data: consent }] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("display_name,email").eq("id", session.accountId).single(),
    supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", session.accountId).maybeSingle(),
    supabaseAdmin.from("creator_applications").select("id,status,answers,updated_at").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_files").select("id,kind,original_name,size_bytes,mime_type,storage_transfer_status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }),
    supabaseAdmin.from("creator_consents").select("id,legal_name,signed_at").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!account) redirect("/creator-auth/logout");
  const answers = (application?.answers || {}) as Record<string,string>;
  const submitted = application?.status === "submitted" || application?.status === "reviewing" || application?.status === "approved";
  const applicationLocked = creator.readOnly || !creatorOnboardingEditable(application?.status, optional);
  const voiceFiles = (files || []).filter((f) => f.kind === "voice" && f.storage_transfer_status === "verified");
  const contentCounts = creatorContentCounts(files || []);
  const categorizedContentComplete = CREATOR_CONTENT_REQUIREMENTS.every(({ kind, minimum }) => contentCounts[kind] >= minimum);
  const contentComplete = creatorContentCompleted(files || [], !!progress?.content_completed);
  const legacyContentFiles = creatorLegacyContentCount(files || []);
  const complete = {
    questionnaire: !!progress?.questionnaire_completed && (optional || questionnaireRequiredMissing(answers).length === 0),
    content: contentComplete,
    voice: !!progress?.voice_completed || voiceFiles.length > 0,
    consent: !!consent,
  } satisfies Record<OnboardingStep, boolean>;
  const steps = visibleSteps.filter((item) => complete[item]).length;
  const readyToSubmit = optional || visibleSteps.every((item) => complete[item]);
  const saved =
    (activeStep === "questionnaire" && status === "questionnaire_saved" && complete.questionnaire) ||
    (activeStep === "content" && status === "content_saved" && complete.content) ||
    (activeStep === "voice" && (status === "voice_saved" || status === "voice_skipped") && complete.voice) ||
    (activeStep === "consent" && status === "consent_saved" && complete.consent);

  return (
    <div className={`min-h-screen bg-bg ${link ? "canvas-glow" : ""}`} data-creator-onboarding-brand={tether ? "tether" : link ? "link" : "twin"} data-onboarding-optional={optional ? "true" : "false"}>
      <header className={tether ? "border-b border-white/10 bg-[#06080c] text-white shadow-[0_8px_30px_rgba(0,0,0,0.16)]" : "border-b border-border bg-white/90 backdrop-blur"}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">{tether && <IntelligenceCoreIcon size={34} />}<TwinWordmark inverse={tether} agencyName={brandName === "Twin" ? undefined : brandName} />{tether && <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-sky-300 sm:inline">Creator</span>}</div>
          <div className="flex items-center gap-2"><a href="/creator" className={buttonVariants({ variant: "outline", className: "min-h-11" })} data-onboarding-dashboard>Dashboard <ChevronRight className="size-4" aria-hidden="true" /></a><form action="/creator-auth/logout" method="post"><button className={tether ? "text-sm font-medium text-white/65 hover:text-white" : "text-sm font-medium text-muted hover:text-ink"}>Sign out</button></form></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{tether ? "Tether creator onboarding" : link ? "LYNQ creator onboarding" : "Creator onboarding"}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Build your {brandName === "Twin" ? "FLIRT" : brandName} digital clone</h1><p className="mt-2 text-muted">{optional ? "All steps are optional. Add what you can now, and return from your dashboard whenever you’re ready." : "Complete the steps below. Your answers and media stay attached to this creator account."}</p></div>
          <div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink" aria-label={submitted ? "Application submitted" : optional ? "All onboarding steps optional" : `${steps} of ${totalSteps} onboarding steps complete`}>{submitted ? "Submitted" : optional ? "All steps optional" : `${steps}/${totalSteps} complete`}</div>
        </div>
        {!optional && <div className="mt-5 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={steps}><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(steps / totalSteps) * 100}%` }} /></div>}

        {optional && !submitted && !applicationLocked && <SkipToDashboard />}

        {optional && submitted && <p className="mt-5 rounded-xl border border-border bg-white p-4 text-sm text-ink">Your onboarding has been submitted. You can still update your answers and upload more content here.</p>}

        {status && errorStatuses.has(status) && <div id="step-result" role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{statusCopy[status]}</div>}

        {!activeStep ? (
          <>
            <div className="mt-8 grid gap-5 md:grid-cols-2" data-onboarding-hub>
              <StepCard step="questionnaire" number={1} title="Questionnaire" description="Tell us about you, your style, personality and boundaries." complete={complete.questionnaire} optional={optional} icon={FileText} />
              <StepCard step="content" number={2} title="Content" description="Upload the image and video library for your digital clone." complete={complete.content} optional={optional} icon={Images} />
              {voiceEnabled && <StepCard step="voice" number={3} title="Voice" description="Upload voice recordings now, or record your choice to skip and activate voice later." complete={complete.voice} optional icon={Mic2} />}
              <StepCard step="consent" number={consentStepNumber} title="Consent & submit" description={optional ? "Review consent or leave it blank, then finish onboarding." : "Confirm permission and submit your completed onboarding."} complete={complete.consent} optional={optional} icon={ShieldCheck} />
            </div>
          </>
        ) : (
          <div className="mt-8 grid gap-5" data-onboarding-active-step={activeStep}>
            {activeStep !== "questionnaire" && <StepNavigation step={activeStep} steps={visibleSteps} />}

            {activeStep === "questionnaire" && <Card className="border border-border bg-white">
              <StepHeader number={1} title="Questionnaire" complete={complete.questionnaire} optional={optional} />
              <CardContent className="grid gap-6 pt-2">
                {saved ? <>
                  <SavedConfirmation title="Questionnaire saved" detail="Your answers have been saved to your creator account." />
                  <div className="flex flex-col gap-3 sm:flex-row"><ReturnToOnboarding /><Link href={`/creator/onboarding?step=questionnaire&section=${questionnairePage.slug}`} className={returnToOnboardingClass()}>Review answers</Link>{optional && <ContinueToStep step="content">Continue to content</ContinueToStep>}</div>
                </> : <CreatorQuestionnaireWizard
                  page={questionnairePage}
                  initialAnswers={Object.fromEntries(questionnairePageQuestions(questionnairePage).map((question) => [question.id, answers[question.id] || (question.id === "preferred_name" ? account.display_name || "" : question.id === "email_address" ? account.email || "" : "")]))}
                  initialRevision={application?.updated_at || ""}
                  locked={applicationLocked}
                  optional={optional}
                />}
              </CardContent>
            </Card>}

            {activeStep === "content" && <Card className="border border-border bg-white">
              <StepHeader number={2} title="Content" complete={complete.content} optional={optional} />
              <CardContent className="grid gap-6 pt-2">
                {status === "content_saved" && <SavedConfirmation title="Content saved" detail="Your uploaded files were verified and the category totals have been updated." />}
                <div className="grid gap-3 rounded-2xl border border-border bg-muted/10 p-5 text-sm leading-6 text-ink">
                  {optional ? <p>All uploads are optional. No photos or videos are needed to continue.</p> : <><p>Upload minimum 20 SFW images and 30 NSFW images.</p><p>Upload 15 SFW videos and 30 NSFW videos.</p></>}
                </div>
                {optional && <div><ContinueToStep step={afterContent}>Continue without uploading</ContinueToStep></div>}
                <div className="grid gap-4 md:grid-cols-2">
                  {CREATOR_CONTENT_REQUIREMENTS.map((requirement) => <ContentUploadCard accountId={session.accountId} loginPath={loginPath} key={requirement.kind} {...requirement} count={contentCounts[requirement.kind]} complete={contentCounts[requirement.kind] >= requirement.minimum} locked={applicationLocked} optional={optional} />)}
                </div>
                {legacyContentFiles > 0 && <p className="rounded-xl border border-border bg-muted/10 px-4 py-3 text-sm leading-6 text-muted">{legacyContentFiles} earlier verified upload{legacyContentFiles === 1 ? " is" : "s are"} still safely stored. They are not guessed into SFW or NSFW categories.</p>}
                <StepNavigation step="content" steps={visibleSteps} />
              </CardContent>
            </Card>}

            {voiceEnabled && activeStep === "voice" && <Card className="border border-border bg-white">
              <StepHeader number={3} title="Voice" complete={complete.voice} optional />
              <CardContent className="grid gap-6 pt-2">
                {saved && <SavedConfirmation title={status === "voice_skipped" ? "Voice step saved" : "Voice samples saved"} detail={statusCopy[status!]} />}
                <p className="text-sm leading-6 text-muted">Voice is not required to get onboarded. Add samples now or skip it and activate voice later.</p>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <CreatorUploadForm accountId={session.accountId} loginPath={loginPath} kind="voice" label="Voice recordings" accept="audio/*,video/*" locked={applicationLocked && !optional} voice />
                  <form action="/creator-auth/onboarding" method="post" className="self-end"><input type="hidden" name="action" value="skip_voice" /><Button type="submit" variant="outline" size="lg" disabled={applicationLocked} className="min-h-11">Skip for now</Button></form>
                </div>
                {voiceFiles.length > 0 && <p className="text-sm text-muted">{voiceFiles.length} voice file{voiceFiles.length === 1 ? "" : "s"} verified.</p>}
                <StepNavigation step="voice" steps={visibleSteps} />
              </CardContent>
            </Card>}

            {activeStep === "consent" && <Card className="border border-border bg-white">
              <StepHeader number={consentStepNumber} title="Consent & submit" complete={complete.consent} optional={optional} />
              <CardContent className="grid gap-6 pt-2">
                {saved && <SavedConfirmation title="Consent saved" detail={optional ? "Your consent has been recorded." : "Your consent has been recorded. You can now submit onboarding when every step is complete."} />}
                {optional && status === "consent_skipped" && <SavedConfirmation title="Consent skipped" detail={statusCopy.consent_skipped} />}
                {optional && <p className="text-sm leading-6 text-muted">Legal name and consent are optional for this walkthrough. Leaving them blank does not grant consent or activate an AI clone.</p>}
                {!consent ? <form action="/creator-auth/onboarding" method="post" className="grid gap-4">
                  <input type="hidden" name="action" value="consent" />
                  <label><span className="mb-1 block text-sm text-muted">Legal name</span><Input name="legal_name" required={!optional} disabled={applicationLocked} className="border-[#7b8798]" /></label>
                  <label className="flex items-start gap-3 text-sm text-ink"><input name="agreed" type="checkbox" required={!optional} disabled={applicationLocked} className="mt-1" /><span>I confirm the information and media I submit are mine or I have permission to provide them, and I authorize {optional && brandName === "Twin" ? "FLIRT" : brandName} to use them to build and operate my AI creator profile under my agreement.</span></label>
                  <div><Button type="submit" variant="outline" size="lg" disabled={applicationLocked} className="min-h-11">{optional ? "Save or skip consent" : "Save consent"}</Button></div>
                </form> : <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Consent signed by {consent.legal_name}.</span></div>}

                <section aria-labelledby="readiness-heading" className="rounded-2xl border border-border bg-muted/10 p-5">
                  <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="readiness-heading" className="text-lg font-semibold text-ink">{optional ? "Ready to finish?" : "Ready to submit?"}</h3><p className="mt-1 text-sm text-muted">{optional ? "Everything below is optional. You can finish with every field blank and no uploads." : voiceEnabled ? "Complete every item below. Voice recordings are optional, but you must upload samples or choose to skip." : "Complete every item below."}</p></div><span className="text-sm font-semibold text-ink">{optional ? "No required steps" : `${steps} of ${totalSteps} complete`}</span></div>
                  <ul className="mt-4 grid gap-3">
                    <ReadinessItem step="questionnaire" complete={complete.questionnaire} optional={optional} title="Questionnaire" detail={optional ? "Answers are optional." : complete.questionnaire ? "Required answers are saved." : "Finish and save the questionnaire."} href="/creator/onboarding?step=questionnaire" />
                    <ReadinessItem step="content" complete={complete.content} optional={optional} title="Content library" detail={optional ? "No photos or videos are required." : complete.content ? (categorizedContentComplete ? "Every image and video minimum is verified." : "Your earlier verified content remains accepted.") : CREATOR_CONTENT_REQUIREMENTS.map(({ kind, shortLabel, minimum }) => `${shortLabel} ${contentCounts[kind]}/${minimum}`).join(" · ")} href="/creator/onboarding?step=content" />
                    {voiceEnabled && <ReadinessItem step="voice" complete={complete.voice} optional={optional} title="Voice choice" detail={optional ? "Voice recordings are optional." : complete.voice ? (voiceFiles.length ? `${voiceFiles.length} voice sample${voiceFiles.length === 1 ? " is" : "s are"} verified.` : "Voice recordings skipped for now.") : "Upload voice samples or choose Skip for now."} href="/creator/onboarding?step=voice" />}
                    <ReadinessItem step="consent" complete={complete.consent} optional={optional} title="Consent" detail={complete.consent ? `Consent signed by ${consent?.legal_name}.` : optional ? "Optional. No consent recorded." : "Enter your legal name and save consent."} href="/creator/onboarding?step=consent" />
                  </ul>
                </section>

                <form action="/creator-auth/onboarding" method="post">
                  <input type="hidden" name="action" value="submit" />
                  <Button type="submit" size="lg" disabled={!readyToSubmit || applicationLocked} aria-describedby={!readyToSubmit && !applicationLocked ? "submit-help" : undefined} className="min-h-11 w-full sm:w-auto">{submitted ? "Return to dashboard" : applicationLocked ? "Application locked" : optional ? "Finish onboarding" : "Submit onboarding"}</Button>
                </form>
                {!readyToSubmit && !applicationLocked && <p id="submit-help" className="text-sm text-muted">Complete the items above before submitting.</p>}
                <StepNavigation step="consent" steps={visibleSteps} />
              </CardContent>
            </Card>}
          </div>
        )}
      </main>
    </div>
  );
}


