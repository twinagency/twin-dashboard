import { redirect } from "next/navigation";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { dashboardOrigin } from "@/lib/form-origin";
import { headers } from "next/headers";
import CopyField from "./CopyField";
import { INVITE_CODE_PATTERN, inviteUrl } from "@/lib/creator-invite-codes";
// serviceClient, not supabaseAdmin: supabaseAdmin's fetch is intercepted for
// agency sessions and force-scoped by clone_id, which these agency_id-scoped
// tables do not have. Every query below scopes to access.id explicitly.
import { serviceClient } from "@/lib/supabase-service";

export const metadata = { title: "Creator invites · FLIRT" };
export const dynamic = "force-dynamic";

const inputCls = "mt-1 block w-full rounded-lg border border-line p-3";

type CodeRow = {
  id: string;
  label: string | null;
  active: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string | null;
};

const dateOnly = (value: string | null) => (value ? value.slice(0, 10) : null);

export default async function AgencyCreatorInvites({ searchParams }: { searchParams: Promise<{ result?: string; created?: string }> }) {
  const access = await getDashboardAccess();
  if (!access) redirect("/creator-management");
  const { result, created } = await searchParams;
  const newCode = created && INVITE_CODE_PATTERN.test(created) ? created : null;

  const codes = await serviceClient()
    .from("creator_agency_codes")
    .select("id,label,active,max_uses,uses,expires_at,created_at")
    .eq("agency_id", access.id)
    .order("created_at", { ascending: false });
  if (codes.error) throw new Error("Creator invite codes are not available");
  const rows = (codes.data ?? []) as CodeRow[];

  const requestHeaders = await headers();
  const origin = dashboardOrigin({ url: `https://${requestHeaders.get("host") || "dashboard.tgaiclone.xyz"}` });
  const now = Date.now();

  const banner = result === "revoked"
    ? "Invite code revoked. Anyone still holding it can no longer sign up with it."
    : result === "error"
      ? "Unable to complete that request. Check the limits you entered."
      : null;

  return (
    <main className="dashboard-page max-w-3xl text-ink">
      <h1 className="mb-2 text-2xl font-semibold">Creator invites</h1>
      <p className="mb-6 text-sm text-muted">
        Generate a signup link for {access.name}. Signing up through the link attaches the new creator account to
        {" "}{access.name} automatically.
      </p>

      {newCode && (
        <div role="status" className="mb-6 rounded-2xl border border-good/40 bg-good/10 p-5">
          <p className="text-sm font-semibold">Copy this now. It is shown once and cannot be recovered.</p>
          <CopyField label="Code" value={newCode} mono="code" />
          <CopyField label="Invite link" value={inviteUrl(origin, newCode)} mono="link" />
          <p className="mt-3 text-xs text-muted">
            Only a hash of the code is stored, so nobody, including this dashboard, can show it again. If it is lost,
            revoke it below and generate a new one.
          </p>
        </div>
      )}

      {banner && <p role="status" className="mb-4 text-sm">{banner}</p>}

      <form action="/agency/creator-invites/manage" method="post" className="space-y-4 rounded-2xl border border-line bg-panel p-6">
        <input type="hidden" name="action" value="generate" />
        <label className="block">Label <span className="text-muted">(optional)</span>
          <input name="label" maxLength={120} autoComplete="off" placeholder="Spring intake" className={inputCls} />
        </label>
        <label className="block">Max uses <span className="text-muted">(optional)</span>
          <input name="max_uses" type="number" min={1} max={999999} step={1} inputMode="numeric" placeholder="Leave blank for unlimited" className={inputCls} />
        </label>
        <label className="block">Expires in days <span className="text-muted">(optional)</span>
          <input name="expires_days" type="number" min={1} max={3650} step={1} inputMode="numeric" placeholder="Leave blank to never expire" className={inputCls} />
        </label>
        <button className="rounded-lg bg-accent px-4 py-2 text-white">Generate invite link</button>
      </form>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Existing codes</h2>
      {rows.length === 0 && <p className="text-sm text-muted">No invite codes yet.</p>}
      <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
        {rows.map((row) => {
          const expired = !!row.expires_at && Date.parse(row.expires_at) <= now;
          const exhausted = row.max_uses != null && row.uses >= row.max_uses;
          const status = !row.active ? "Revoked" : expired ? "Expired" : exhausted ? "Used up" : "Active";
          return (
            <div key={row.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{row.label || "No label"}</p>
                <p className="text-xs text-muted">
                  {row.uses} of {row.max_uses ?? "unlimited"} used
                  {row.expires_at ? `, expires ${dateOnly(row.expires_at)}` : ", no expiry"}
                  {row.created_at ? `, created ${dateOnly(row.created_at)}` : ""}
                </p>
              </div>
              <span className={"whitespace-nowrap rounded border px-2 py-0.5 text-xs " + (status === "Active" ? "border-good/40 text-good" : "border-line text-muted")}>{status}</span>
              {row.active && (
                <form action="/agency/creator-invites/manage" method="post">
                  <input type="hidden" name="action" value="revoke" />
                  <input type="hidden" name="id" value={row.id} />
                  <button className="rounded-lg border border-crit px-3 py-1.5 text-crit">Revoke</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

