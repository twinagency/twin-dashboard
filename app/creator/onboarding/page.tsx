import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_QUESTIONNAIRE_SECTIONS, type CreatorQuestion } from "@/lib/creator-questionnaire";
import { TETHER_PORTAL } from "@/lib/partner-portals";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "@/lib/creator-routing";
import { isLynq } from "@/lib/agency-brand";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Circle, FileText, Images, Mic2, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const statusCopy: Record<string,string> = {
  questionnaire_saved: "Questionnaire saved.",
  questionnaire_missing: "Complete the required questionnaire fields before continuing.",
  content_saved: "Content uploaded and verified.",
  voice_saved: "Voice samples uploaded and verified.",
  voice_skipped: "Voice setup skipped for now. You can add it later.",
  consent_saved: "Consent saved.",
  upload_empty: "Choose at least one file.",
  upload_too_many: "Upload up to 25 files at a time.",
  upload_too_large: "One of those files is too large for this upload.",
  upload_error: "That upload did not finish. Review the verified-file count, then try the remaining files.",
  consent_missing: "Enter your legal name and confirm consent.",
  not_ready: "Finish the required onboarding steps before submitting.",
  error: "Something went wrong. Please try again.",
};

const requiredQuestionIds = new Set(["full_name", "preferred_name", "platforms", "boundaries"]);
const errorStatuses = new Set(["questionnaire_missing", "upload_empty", "upload_too_many", "upload_too_large", "upload_error", "consent_missing", "not_ready", "error"]);
const onboardingSteps = ["questionnaire", "content", "voice", "consent"] as const;
type OnboardingStep = (typeof onboardingSteps)[number];

function isOnboardingStep(value: string | undefined): value is OnboardingStep {
  return onboardingSteps.includes(value as OnboardingStep);
}

function returnToOnboardingClass() {
  return buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto" });
}

function CompletionMark({ complete }: { complete: boolean }) {
  return complete ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="size-4" aria-hidden="true" /> Complete
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted">
      <Circle className="size-3.5" aria-hidden="true" /> Not complete
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
            <CompletionMark complete={complete} />
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
        <CompletionMark complete={complete} />
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

function textAreaClass() {
  return "min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}

function selectClass() {
  return "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}

function QuestionField({ question, value }: { question: CreatorQuestion; value: string }) {
  const required = requiredQuestionIds.has(question.id);
  const label = <span className="mb-1 block text-sm font-medium text-ink">{question.label}{required ? " *" : ""}</span>;
  const help = question.help ? <span className="mt-1 block text-xs leading-relaxed text-muted">{question.help}</span> : null;

  if (question.type === "textarea") {
    return <label className="block">{label}<textarea name={question.id} className={textAreaClass()} placeholder={question.placeholder} defaultValue={value} required={required} />{help}</label>;
  }

  if (question.type === "select") {
    return <label className="block">{label}<select name={question.id} className={selectClass()} defaultValue={value} required={required}><option value="">Select...</option>{(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>{help}</label>;
  }

  if (question.type === "radio") {
    return <fieldset className="block"><legend className="mb-2 text-sm font-medium text-ink">{question.label}{required ? " *" : ""}</legend><div className="flex flex-wrap gap-3">{(question.options || []).map((option) => <label key={option} className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"><input type="radio" name={question.id} value={option} defaultChecked={value === option} required={required} />{option}</label>)}</div>{help}</fieldset>;
  }

  return <label className="block">{label}<Input name={question.id} defaultValue={value} placeholder={question.placeholder} required={required} />{help}</label>;
}

export default async function CreatorOnboardingPage({ searchParams }: { searchParams: Promise<{ status?: string; step?: string }> }) {
  const jar = await cookies();
  const creator = await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator) redirect(creatorLoginPath(creator, jar.get(CREATOR_PORTAL_COOKIE)?.value));
  const session = { accountId: creator.accountId };
  const tether = creator.name === TETHER_PORTAL.name;
  const link = isLynq(creator.name);
  const brandName = tether ? "Tether" : link ? "LYNQ" : "Twin";
  const { status, step } = await searchParams;
  const activeStep = isOnboardingStep(step) ? step : null;

  const [{ data: account }, { data: progress }, { data: application }, { data: files }, { data: consent }] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("display_name,email").eq("id", session.accountId).single(),
    supabaseAdmin.from("creator_onboarding_progress").select("questionnaire_completed,content_completed,voice_completed").eq("creator_account_id", session.accountId).maybeSingle(),
    supabaseAdmin.from("creator_applications").select("id,status,answers").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_files").select("id,kind,original_name,size_bytes,storage_transfer_status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }),
    supabaseAdmin.from("creator_consents").select("id,legal_name,signed_at").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!account) redirect("/creator-auth/logout");
  const answers = (application?.answers || {}) as Record<string,string>;
  const contentFiles = (files || []).filter((f) => f.kind === "content" && f.storage_transfer_status === "verified");
  const voiceFiles = (files || []).filter((f) => f.kind === "voice" && f.storage_transfer_status === "verified");
  const complete = {
    questionnaire: !!progress?.questionnaire_completed,
    content: !!progress?.content_completed && contentFiles.length > 0,
    voice: !!progress?.voice_completed,
    consent: !!consent,
  } satisfies Record<OnboardingStep, boolean>;
  const steps = Object.values(complete).filter(Boolean).length;
  const submitted = application?.status === "submitted" || application?.status === "reviewing" || application?.status === "approved";
  const saved =
    (activeStep === "questionnaire" && status === "questionnaire_saved" && complete.questionnaire) ||
    (activeStep === "content" && status === "content_saved" && complete.content) ||
    (activeStep === "voice" && (status === "voice_saved" || status === "voice_skipped") && complete.voice) ||
    (activeStep === "consent" && status === "consent_saved" && complete.consent);

  return (
    <div className={`min-h-screen bg-bg ${link ? "canvas-glow" : ""}`} data-creator-onboarding-brand={tether ? "tether" : link ? "link" : "twin"}>
      <header className={tether ? "border-b border-white/10 bg-[#06080c] text-white shadow-[0_8px_30px_rgba(0,0,0,0.16)]" : "border-b border-border bg-white/90 backdrop-blur"}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">{tether && <IntelligenceCoreIcon size={34} />}<TwinWordmark inverse={tether} agencyName={brandName === "Twin" ? undefined : brandName} />{tether && <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-sky-300 sm:inline">Creator</span>}</div>
          <div className="flex items-center gap-4"><Link href="/creator" className={tether ? "text-sm font-medium text-white/65 hover:text-white" : "text-sm font-medium text-muted hover:text-ink"}>Dashboard</Link><form action="/creator-auth/logout" method="post"><button className={tether ? "text-sm font-medium text-white/65 hover:text-white" : "text-sm font-medium text-muted hover:text-ink"}>Sign out</button></form></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{tether ? "Tether creator onboarding" : link ? "LYNQ creator onboarding" : "Creator onboarding"}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Build your {brandName} digital clone</h1><p className="mt-2 text-muted">Complete the steps below. Your answers and media stay attached to this creator account.</p></div>
          <div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink">{submitted ? "Submitted" : `${steps}/4 complete`}</div>
        </div>

        {status && errorStatuses.has(status) && <div id="step-result" role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{statusCopy[status]}</div>}

        {!activeStep ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2" data-onboarding-hub>
            <StepCard step="questionnaire" number={1} title="Questionnaire" description="Tell us about you, your style, personality and boundaries." complete={complete.questionnaire} icon={FileText} />
            <StepCard step="content" number={2} title="Content" description="Upload the image and video library for your digital clone." complete={complete.content} icon={Images} />
            <StepCard step="voice" number={3} title="Voice" description="Add voice recordings now, or skip this step and activate voice later." complete={complete.voice} optional icon={Mic2} />
            <StepCard step="consent" number={4} title="Consent & submit" description="Confirm permission and submit your completed onboarding." complete={complete.consent} icon={ShieldCheck} />
          </div>
        ) : (
          <div className="mt-8 grid gap-5" data-onboarding-active-step={activeStep}>
            <div><ReturnToOnboarding /></div>

            {activeStep === "questionnaire" && <Card className="border border-border bg-white">
              <StepHeader number={1} title="Questionnaire" complete={complete.questionnaire} />
              <CardContent className="grid gap-6 pt-2">
                {saved ? <>
                  <SavedConfirmation title="Questionnaire saved" detail="Your answers have been saved to your creator account." />
                  <div className="flex flex-col gap-3 sm:flex-row"><ReturnToOnboarding /><Link href="/creator/onboarding?step=questionnaire" className={returnToOnboardingClass()}>Edit answers</Link></div>
                </> : <form action="/creator-auth/onboarding" method="post" className="grid gap-8">
                  <input type="hidden" name="action" value="questionnaire" />
                  {CREATOR_QUESTIONNAIRE_SECTIONS.map((section, sectionIndex) => (
                    <section key={`${section.title}-${sectionIndex}`} className="rounded-2xl border border-border bg-white p-5">
                      <h3 className="text-lg font-semibold text-ink">{section.title}</h3>
                      {section.intro && <p className="mt-2 text-sm leading-relaxed text-muted">{section.intro}</p>}
                      <div className="mt-5 grid gap-5 md:grid-cols-2">
                        {section.questions.map((question, questionIndex) => (
                          <div key={`${question.id}-${questionIndex}`} className={question.type === "textarea" || question.type === "radio" ? "md:col-span-2" : ""}>
                            <QuestionField question={question} value={answers[question.id] || (question.id === "preferred_name" ? account.display_name || "" : question.id === "email_address" ? account.email || "" : "")} />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                  <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-white/95 p-4 shadow-lg backdrop-blur"><Button type="submit" size="lg">Save questionnaire</Button></div>
                </form>}
              </CardContent>
            </Card>}

            {activeStep === "content" && <Card className="border border-border bg-white">
              <StepHeader number={2} title="Content" complete={complete.content} />
              <CardContent className="grid gap-6 pt-2">
                {saved && <SavedConfirmation title="Content saved" detail="Your uploaded files were verified and added to this creator account." />}
                <div className="grid gap-3 rounded-2xl border border-border bg-muted/10 p-5 text-sm leading-6 text-ink">
                  <p>Upload minimum 20 SFW images and 30 NSFW images.</p>
                  <p>Upload 15 SFW videos and 30 NSFW videos.</p>
                </div>
                <form action="/creator-auth/upload" method="post" encType="multipart/form-data" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input type="hidden" name="kind" value="content" />
                  <label className="flex-1"><span className="mb-1 block text-sm text-muted">Images / videos</span><Input name="files" type="file" accept="image/*,video/*" multiple required className="h-auto py-2" /></label>
                  <Button type="submit" size="lg">Upload content</Button>
                </form>
                {contentFiles.length > 0 && <p className="text-sm text-muted">{contentFiles.length} verified file{contentFiles.length === 1 ? "" : "s"}. Latest: {contentFiles.slice(0,3).map((f) => f.original_name || "file").join(", ")}{contentFiles.length > 3 ? ` +${contentFiles.length - 3} more` : ""}</p>}
                <div><ReturnToOnboarding /></div>
              </CardContent>
            </Card>}

            {activeStep === "voice" && <Card className="border border-border bg-white">
              <StepHeader number={3} title="Voice" complete={complete.voice} optional />
              <CardContent className="grid gap-6 pt-2">
                {saved && <SavedConfirmation title={status === "voice_skipped" ? "Voice step saved" : "Voice samples saved"} detail={statusCopy[status!]} />}
                <p className="text-sm leading-6 text-muted">Voice is not required to get onboarded. Add samples now or skip it and activate voice later.</p>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <form action="/creator-auth/upload" method="post" encType="multipart/form-data" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <input type="hidden" name="kind" value="voice" />
                    <label className="flex-1"><span className="mb-1 block text-sm text-muted">Voice recordings</span><Input name="files" type="file" accept="audio/*,video/*" multiple className="h-auto py-2" /></label>
                    <Button type="submit" variant="outline" size="lg">Upload voice</Button>
                  </form>
                  <form action="/creator-auth/onboarding" method="post" className="self-end"><input type="hidden" name="action" value="skip_voice" /><Button type="submit" variant="outline" size="lg">Skip for now</Button></form>
                </div>
                {voiceFiles.length > 0 && <p className="text-sm text-muted">{voiceFiles.length} voice file{voiceFiles.length === 1 ? "" : "s"} verified.</p>}
                <div><ReturnToOnboarding /></div>
              </CardContent>
            </Card>}

            {activeStep === "consent" && <Card className="border border-border bg-white">
              <StepHeader number={4} title="Consent & submit" complete={complete.consent} />
              <CardContent className="grid gap-6 pt-2">
                {saved && <SavedConfirmation title="Consent saved" detail="Your consent has been recorded. You can now submit onboarding when every step is complete." />}
                {!consent ? <form action="/creator-auth/onboarding" method="post" className="grid gap-4">
                  <input type="hidden" name="action" value="consent" />
                  <label><span className="mb-1 block text-sm text-muted">Legal name</span><Input name="legal_name" required /></label>
                  <label className="flex items-start gap-3 text-sm text-ink"><input name="agreed" type="checkbox" required className="mt-1" /><span>I confirm the information and media I submit are mine or I have permission to provide them, and I authorize {brandName} to use them to build and operate my AI creator profile under my agreement.</span></label>
                  <div><Button type="submit" variant="outline" size="lg">Save consent</Button></div>
                </form> : <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Consent signed by {consent.legal_name}.</span></div>}

                <form action="/creator-auth/onboarding" method="post">
                  <input type="hidden" name="action" value="submit" />
                  <Button type="submit" size="lg" disabled={submitted}>{submitted ? "Application submitted" : "Submit onboarding"}</Button>
                </form>
                <div><ReturnToOnboarding /></div>
              </CardContent>
            </Card>}
          </div>
        )}
      </main>
    </div>
  );
}
