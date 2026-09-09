import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator onboarding · Twin" };

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

function textAreaClass() {
  return "min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}

export default async function CreatorOnboardingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!session) redirect("/creator/login");
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
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <TwinWordmark />
          <div className="flex items-center gap-4"><Link href="/creator" className="text-sm font-medium text-muted hover:text-ink">Dashboard</Link><form action="/creator-auth/logout" method="post"><button className="text-sm font-medium text-muted hover:text-ink">Sign out</button></form></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator onboarding</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Build your Twin profile</h1><p className="mt-2 text-muted">Complete the steps below. Your answers and media stay attached to this creator account.</p></div>
          <div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink">{submitted ? "Submitted" : `${steps}/4 complete`}</div>
        </div>

        {status && <div className="mt-6 rounded-xl border border-border bg-white px-4 py-3 text-sm text-ink">{statusCopy[status] || statusCopy.error}</div>}

        <div className="mt-8 grid gap-6">
          <Card>
            <CardHeader><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-2">Step 1</p><h2 className="font-heading text-2xl font-semibold text-ink">Questionnaire</h2></div><span className="text-sm font-medium text-muted">{progress?.questionnaire_completed ? "Complete" : "Required"}</span></div></CardHeader>
            <CardContent>
              <form action="/creator-auth/onboarding" method="post" className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="action" value="questionnaire" />
                <label><span className="mb-1 block text-sm text-muted">Full legal name *</span><Input name="full_name" defaultValue={answers.full_name || ""} required /></label>
                <label><span className="mb-1 block text-sm text-muted">Preferred creator name *</span><Input name="preferred_name" defaultValue={answers.preferred_name || account.display_name || ""} required /></label>
                <label><span className="mb-1 block text-sm text-muted">Date of birth</span><Input name="date_of_birth" type="date" defaultValue={answers.date_of_birth || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">Pronouns</span><Input name="pronouns" defaultValue={answers.pronouns || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">Where are you from / where did you grow up?</span><Input name="from_grew_up" defaultValue={answers.from_grew_up || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">Platforms *</span><Input name="platforms" placeholder="Instagram, TikTok, X..." defaultValue={answers.platforms || ""} required /></label>
                <label><span className="mb-1 block text-sm text-muted">Audience size</span><Input name="audience_size" defaultValue={answers.audience_size || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">Main niche</span><Input name="main_niche" defaultValue={answers.main_niche || ""} /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Describe your audience</span><textarea name="audience_description" className={textAreaClass()} defaultValue={answers.audience_description || ""} /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Content style</span><textarea name="content_style" className={textAreaClass()} defaultValue={answers.content_style || ""} /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">How should your Twin come across?</span><textarea name="creator_persona" className={textAreaClass()} defaultValue={answers.creator_persona || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">Overall tone</span><Input name="overall_tone" defaultValue={answers.overall_tone || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">AI personality</span><Input name="ai_personality" defaultValue={answers.ai_personality || ""} /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Traits your Twin should have</span><textarea name="ai_traits" className={textAreaClass()} defaultValue={answers.ai_traits || ""} /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Boundaries / things your Twin must not do *</span><textarea name="boundaries" className={textAreaClass()} defaultValue={answers.boundaries || ""} required /></label>
                <label><span className="mb-1 block text-sm text-muted">Catch phrases</span><Input name="catch_phrases" defaultValue={answers.catch_phrases || ""} /></label>
                <label><span className="mb-1 block text-sm text-muted">Future goals</span><Input name="future_goals" defaultValue={answers.future_goals || ""} /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm text-muted">Anything else we should know?</span><textarea name="anything_else" className={textAreaClass()} defaultValue={answers.anything_else || ""} /></label>
                <div className="md:col-span-2"><Button type="submit">Save questionnaire</Button></div>
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
                <label className="flex items-start gap-3 text-sm text-ink"><input name="agreed" type="checkbox" required className="mt-1" /><span>I confirm the information and media I submit are mine or I have permission to provide them, and I authorize Twin to use them to build and operate my AI Twin under my agreement with Twin.</span></label>
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
