import { notFound } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { startViewAs } from "./actions";
import ViewAsList, { type ViewAsRow } from "./ViewAsList";

export const dynamic = "force-dynamic";

type CloneNameJoin = { name: string } | { name: string }[] | null;
type CreatorRow = {
  id: string;
  display_name: string | null;
  account_status: string | null;
  creator_clone_links: { clone_id: string; clones: CloneNameJoin } | { clone_id: string; clones: CloneNameJoin }[] | null;
};

function cloneNameOf(clones: CloneNameJoin): string | undefined {
  if (!clones) return undefined;
  return Array.isArray(clones) ? clones[0]?.name : clones.name;
}

async function loadRows(): Promise<ViewAsRow[]> {
  const [agencies, creators] = await Promise.all([
    supabaseAdmin.from("partner_agencies").select("id,name").eq("active", true).order("name"),
    supabaseAdmin
      .from("creator_accounts")
      .select("id,display_name,account_status,creator_clone_links(clone_id,clones(name))")
      .order("display_name"),
  ]);
  const agencyRows: ViewAsRow[] = (agencies.data ?? []).map((a: { id: string; name: string }) => ({
    targetType: "agency" as const,
    targetId: a.id,
    name: a.name,
    detail: "agency",
  }));
  const allowedStatus = new Set(["applicant", "approved", "active"]);
  const creatorRows: ViewAsRow[] = ((creators.data ?? []) as CreatorRow[])
    .filter((c) => allowedStatus.has(c.account_status ?? ""))
    .map((c) => {
      const link = Array.isArray(c.creator_clone_links) ? c.creator_clone_links[0] : c.creator_clone_links;
      const cloneName = cloneNameOf(link?.clones ?? null);
      return {
        targetType: "creator" as const,
        targetId: c.id,
        name: c.display_name || "Unnamed creator",
        detail: cloneName ? `creator, linked to ${cloneName}` : "creator, no clone linked yet",
      };
    });
  return [...agencyRows, ...creatorRows];
}

// Master admin only. Everyone else (agency, creator, unauthenticated) gets a
// 404, not a 403: this page's existence is not something to advertise.
// middleware.ts already keeps non-admin sessions off this path in
// production; this check is the one that actually matters and is re-run on
// every request rather than trusted from routing.
export default async function ViewAsPage() {
  if (!(await isAuthed())) notFound();
  const rows = await loadRows();
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">View as</h1>
      <p className="mt-1 text-sm opacity-70">
        Browse any agency or creator&apos;s dashboard exactly as they see it. Read only, one hour, logged.
      </p>
      <div className="mt-5">
        <ViewAsList rows={rows} action={startViewAs} />
      </div>
    </div>
  );
}
