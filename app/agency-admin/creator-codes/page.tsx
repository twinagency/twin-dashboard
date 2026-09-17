import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { INVITE_CODE_PATTERN, inviteUrl } from "@/lib/creator-invite-codes";
import { supabaseAdmin } from "@/lib/supabase";

export const metadata = { title: "Creator invites · Twin" };
export const dynamic = "force-dynamic";

const inputCls = "mt-1 block w-full rounded-lg border border-line p-3";

type CodeRow = {
  id: string;
  agency_id: string;
  label: string | null;
  active: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string | null;
};

// Mirrors lib/form-origin.ts. The request Host header is only trusted outside
// production, where there is no configured public origin to use instead.
async function pageOrigin(): Promise<string> {
  const configured = process.env.DASHBOARD_PUBLIC_ORIGIN;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") return "https://dashboard.tgaiclone.xyz";
  const host = (await headers()).get("host") || "localhost:3001";
  return `http://${host}`;
}

const dateOnly = (value: string | null) => (value ? value.slice(0, 10) : null);

export default async function CreatorCodes({ searchParams }: { searchParams: Promise<{ result?: string; created?: string }> }) {
  if (!await isAuthed()) redirect("/login");
  const { result, created } = await searchParams;
  // Reflected only when it is shaped like a code this app mints.
  const newCode = created && INVITE_CODE_PATTERN.test(created) ? created : null;

  const [agencies, codes] = await Promise.all([
    supabaseAdmin.from("partner_agencies").select("id,name,slug,active").order("name"),
    supabaseAdmin
      .from("creator_agency_codes")
      .select("id,agency_id,label,active,max_uses,uses,expires_at,created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (agencies.error) throw new Error("Agency access is not configured yet");
  if (codes.error) throw new Error("Creator invite codes are not available");

  const agencyList = (agencies.data ?? []) as { id: string; name: string; slug: string; active: boolean }[];
  const activeAgencies = agencyList.filter((a) => a.active);
  const names = new Map(agencyList.map((a) => [a.id, a.name]));
  const rows = (codes.data ?? []) as CodeRow[];
  const grouped = agencyList
    .map((agency) => ({ agency, rows: rows.filter((row) => row.agency_id === agency.id) }))
    .filter((group) => group.rows.length > 0);
  const orphans = rows.filter((row) => !names.has(row.agency_id));
  const origin = await pageOrigin();
  const now = Date.now();

  const banner = result === "revoked"
    ? "Invite code revoked. Anyone still holding it can no longer sign up with it."
    : result === "error"
      ? "Unable to complete that request. Check the agency and the limits you entered."
      : null;

  return (
    <main className="dashboard-page max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold">Creator invites</h1>
      <p className="mb-6 text-sm text-muted">
        Generate a signup link an agency can send to its creators. Signing up through the link attaches the new creator
        account to that agency automatically.
      </p>

      {newCode && (
        <div role="status" className="mb-6 rounded-2xl border border-good/40 bg-good/10 p-5">
          <p className="text-sm font-semibold">Copy this now. It is shown once and cannot be recovered.</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted">Code</p>
          <p className="select-all font-mono text-xl tracking-[0.2em]">{newCode}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted">Invite link</p>
          <p className="select-all break-all font-mono text-sm">{inviteUrl(origin, newCode)}</p>
          <p className="mt-3 text-xs text-muted">
            Only a hash of the code is stored, so nobody, including this dashboard, can show it again. If it is lost,
            revoke it below and generate a new one.
          </p>
        </div>
      )}

      {banner && <p role="status" className="mb-4 text-sm">{banner}</p>}

      <form action="/agency-admin/creator-codes/manage" method="post" className="space-y-4 rounded-2xl border border-line bg-panel p-6">
        <input type="hidden" name="action" value="generate" />
        <label className="block">Agency
          <select name="agency" required className={inputCls}>
            {activeAgencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="block">Label <span className="text-muted">(optional)</span>
          <input name="label" maxLength={120} autoComplete="off" placeholder="Moxy spring intake" className={inputCls} />
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
      {grouped.length === 0 && orphans.length === 0 && <p className="text-sm text-muted">No invite codes yet.</p>}
      <div className="space-y-6">
        {grouped.map(({ agency, rows: agencyRows }) => (
          <section key={agency.id}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{agency.name}</h3>
            <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
              {agencyRows.map((row) => {
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
                      <form action="/agency-admin/creator-codes/manage" method="post">
                        <input type="hidden" name="action" value="revoke" />
                        <input type="hidden" name="id" value={row.id} />
                        <button className="rounded-lg border border-crit px-3 py-1.5 text-crit">Revoke</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {orphans.length > 0 && (
          <p className="text-sm text-muted">{orphans.length} code(s) belong to an agency that no longer exists.</p>
        )}
      </div>
    </main>
  );
}
