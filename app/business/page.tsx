import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { setCloneScope } from "@/app/actions/clone-scope";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BusinessAccountManager from "./BusinessAccountManager";

export const dynamic = "force-dynamic";

// Business account management: her CONNECTED TELEGRAM BUSINESS ACCOUNT itself
// (name, username, bio, profile photo, stories) via Bot API 9.0's
// setBusinessAccount* methods and postStory. Distinct from Fans/Messages
// (app/users) which is about individual fan chats — there's no fan involved
// here, only the one business connection behind the clone. Only ever makes
// sense scoped to a single clone, same reasoning as Media/Campaigns.
export default async function BusinessPage() {
  const cloneId = await getCloneScope();
  if (cloneId) return <BusinessAccountManager cloneId={cloneId} />;

  const { data: clones } = await supabaseAdmin
    .from("clones")
    .select("id,name,slug")
    .order("created_at", { ascending: true });
  const rows = (clones ?? []) as { id: string; name: string; slug: string }[];

  return (
    <div className="text-ink">
      <h1 className="mb-1 text-2xl font-semibold">Business account</h1>
      <p className="mb-5 text-sm text-muted">
        Manage her connected Telegram Business profile: name, username, bio, photo and stories. Pick a clone to continue.
      </p>
      <Card className="flex flex-col divide-y divide-line p-0">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-muted">No clones yet.</div>
        ) : (
          rows.map((c) => (
            <form key={c.id} action={setCloneScope.bind(null, c.id)} className="flex items-center justify-between gap-2 p-3">
              <div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted">@{c.slug}</div>
              </div>
              <Button type="submit" variant="outline" size="sm">
                Open
              </Button>
            </form>
          ))
        )}
      </Card>
    </div>
  );
}
