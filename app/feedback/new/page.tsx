import { supabaseAdmin } from "@/lib/supabase";
import FeedbackForm from "../FeedbackForm";

export const dynamic = "force-dynamic";

export default async function NewFeedbackPage() {
  let clones: { id: string; name: string }[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("clones")
      .select("id,name")
      .order("name", { ascending: true });
    clones = (data ?? []) as { id: string; name: string }[];
  } catch {
    // Clone picker is optional — render the form even if clones can't be loaded.
  }

  return (
    <div className="text-ink">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Report a bug or suggest a feature</h1>
        <a
          href="/feedback"
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
        >
          ← Back to queue
        </a>
      </div>
      <p className="mb-5 text-sm text-muted">
        Everything you submit lands in the triage queue for review.
      </p>
      <FeedbackForm clones={clones} />
    </div>
  );
}
