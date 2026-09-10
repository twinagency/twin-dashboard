import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { CREATOR_QUESTIONNAIRE_SECTIONS, type CreatorQuestion } from "@/lib/creator-questionnaire";
import { TETHER_PORTAL } from "@/lib/partner-portals";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator onboarding" };

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
  upload_error: "That upload failed. Nothing was marked complete. Try again.",
  consent_missing: "Enter your legal name and confirm consent.",
  not_ready: "Finish the required onboarding steps before submitting.",
  error: "Something went wrong. Please try again.",
};

const requiredQuestionIds = new Set(["full_name", "preferred_name", "platforms", "boundaries"]);

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

export default async function CreatorOnboardingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const creator = await creatorDashboardIdentity((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator) redirect("/creator/login");
  const session = { accountId: creator.accountId };
  const tether = creator.name === TETHER_PORTAL.name;
  const { status } = await searchParams;

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
  const steps = [!!progress?.questionnaire_completed, !!progress?.content_completed, !!progress?.voice_completed, !!consent].filter(Boolean).length;
  const submitted = application?.status === "submitted" || application?.status === "reviewing" || application?.status === "approved";

  return (
    <div className="min-h-screen bg-bg" data-creator-onboarding-brand={tether ? "tether" : "twin"}>
      <header className={tether ? "border-b border-white/10 bg-[#06080c] text-white shadow-[0_8px_30px_rgba(0,0,0,0.16)]" : "border-b border-border bg-white/90 backdrop-blur"}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">{tether && <IntelligenceCoreIcon size={34} />}<TwinWordmark inverse={tether} agencyName={tether ? TETHER_PORTAL.name : undefined} />{tether && <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-sky-300 sm:inline">Creator</span>}</div>
          <div className="flex items-center gap-4"><Link href="/creator" className={tether ? "text-sm font-medium text-white/65 hover:text-white" : "text-sm font-medium text-muted hover:text-ink"}>Dashboard</Link><form action="/creator-auth/logout" method="post"><button className={tether ? "text-sm font-medium text-white/65 hover:text-white" : "text-sm font-medium text-muted hover:text-ink"}>Sign out</button></form></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{tether ? "Tether creator onboarding" : "Creator onboarding"}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Build your {tether ? "Tether" : "Twin"} profile</h1><p className="mt-2 text-muted">Complete the steps below. Your answers and media stay attached to this creator account.</p></div>
          <div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink">{submitted ? "Submitted" : `${steps}/4 complete`}</div>
        </div>

        {status && <div className="mt-6 rounded-xl border border-border bg-white px-4 py-3 text-sm text-ink">{statusCopy[status] || statusCopy.error}</div>}

        <div className="mt-8 grid gap-6">
          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step 1</p><h2 className="font-heading text-2xl font-semibold text-ink">Questionnaire</h2><p className="mt-1 text-sm text-muted">This is the same questionnaire used in the current Twin/Lovable onboarding.</p></div><span className="text-sm font-medium text-muted">{progress?.questionnaire_completed ? "Complete" : "Required"}</span></div></CardHeader>
            <CardContent>
              <form action="/creator-auth/onboarding" method="post" className="grid gap-8">
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
                <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-white/95 p-4 shadow-lg backdrop-blur"><Button type="submit">Save questionnaire</Button></div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step 2</p><h2 className="font-heading text-2xl font-semibold text-ink">Creator content</h2></div><span className="text-sm font-medium text-muted">{contentFiles.length} verified</span></div></CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted">Upload photos and videos that can be stored against your creator profile. This is separate from PPV content.</p>
              <form action="/creator-auth/upload" method="post" encType="multipart/form-data" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="kind" value="content" />
                <label className="flex-1"><span className="mb-1 block text-sm text-muted">Photos / videos</span><Input name="files" type="file" accept="image/*,video/*" multiple required className="h-auto py-2" /></label>
                <Button type="submit">Upload content</Button>
              </form>
              {contentFiles.length > 0 && <p className="mt-4 text-sm text-muted">Latest: {contentFiles.slice(0,3).map((f) => f.original_name || "file").join(", ")}{contentFiles.length > 3 ? ` +${contentFiles.length - 3} more` : ""}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step 3</p><h2 className="font-heading text-2xl font-semibold text-ink">Voice</h2></div><span className="text-sm font-medium text-muted">{progress?.voice_completed ? "Complete" : "Optional at launch"}</span></div></CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted">Voice is not required to get onboarded. Add samples now or skip it and activate voice later.</p>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <form action="/creator-auth/upload" method="post" encType="multipart/form-data" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input type="hidden" name="kind" value="voice" />
                  <label className="flex-1"><span className="mb-1 block text-sm text-muted">Voice recordings</span><Input name="files" type="file" accept="audio/*,video/*" multiple className="h-auto py-2" /></label>
                  <Button type="submit" variant="outline">Upload voice</Button>
                </form>
                <form action="/creator-auth/onboarding" method="post" className="self-end"><input type="hidden" name="action" value="skip_voice" /><Button type="submit" variant="outline">Skip for now</Button></form>
              </div>
              {voiceFiles.length > 0 && <p className="mt-4 text-sm text-muted">{voiceFiles.length} voice file{voiceFiles.length === 1 ? "" : "s"} verified.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step 4</p><h2 className="font-heading text-2xl font-semibold text-ink">Consent & submit</h2></div><span className="text-sm font-medium text-muted">{consent ? "Signed" : "Required"}</span></div></CardHeader>
            <CardContent className="grid gap-5">
              {!consent ? <form action="/creator-auth/onboarding" method="post" className="grid gap-4">
                <input type="hidden" name="action" value="consent" />
                <label><span className="mb-1 block text-sm text-muted">Legal name</span><Input name="legal_name" required /></label>
                <label className="flex items-start gap-3 text-sm text-ink"><input name="agreed" type="checkbox" required className="mt-1" /><span>I confirm the information and media I submit are mine or I have permission to provide them, and I authorize {tether ? "Tether" : "Twin"} to use them to build and operate my AI creator profile under my agreement.</span></label>
                <div><Button type="submit" variant="outline">Save consent</Button></div>
              </form> : <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted">Consent signed by {consent.legal_name}.</div>}

              <form action="/creator-auth/onboarding" method="post">
                <input type="hidden" name="action" value="submit" />
                <Button type="submit" disabled={submitted}>{submitted ? "Application submitted" : "Submit onboarding"}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
