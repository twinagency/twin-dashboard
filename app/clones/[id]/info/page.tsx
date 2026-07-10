import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getMe(token: string): Promise<{ ok: boolean; username?: string; id?: number }> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: ctrl.signal });
    const j = await r.json();
    return { ok: !!j.ok, username: j.result?.username, id: j.result?.id };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(to);
  }
}

async function getStarBalance(token: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMyStarBalance`, { method: "POST" });
    const j = await r.json();
    return j.ok ? (j.result?.amount ?? null) : null;
  } catch {
    return null;
  }
}

export default async function CloneInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: clone } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,status,bot_token")
    .eq("id", id)
    .maybeSingle();
  if (!clone) return <div className="p-6">Clone not found.</div>;

  const [me, balance, { data: users }, { data: tx }] = await Promise.all([
    getMe(clone.bot_token),
    getStarBalance(clone.bot_token),
    supabaseAdmin.from("users").select("business_connection_id,total_messages_purchased").eq("clone_id", id),
    supabaseAdmin.from("star_transactions").select("amount_stars").eq("clone_id", id),
  ]);

  const userList = (users ?? []) as { business_connection_id: string | null; total_messages_purchased: number }[];
  const starsEarned = (tx ?? []).reduce((s, r) => s + (Number((r as { amount_stars: number }).amount_stars) || 0), 0);
  const connected = userList.some((u) => u.business_connection_id);
  const buyers = userList.filter((u) => (u.total_messages_purchased ?? 0) > 0).length;

  const rows: { label: string; value: string; accent?: "good" | "bad" }[] = [
    { label: "Bot", value: me.username ? `@${me.username}` : "—" },
    { label: "Reachable", value: me.ok ? "yes" : "no — check token/network", accent: me.ok ? "good" : "bad" },
    { label: "Status", value: clone.status, accent: clone.status === "active" ? "good" : undefined },
    { label: "Business account connected", value: connected ? "yes" : "not detected", accent: connected ? "good" : undefined },
    { label: "Stars balance (bot)", value: balance != null ? `${balance} ⭐` : "unavailable" },
    { label: "Stars earned (all-time)", value: `${starsEarned} ⭐` },
    { label: "Fans", value: String(userList.length) },
    { label: "Buyers", value: String(buyers) },
    { label: "Bot token", value: `••••${(clone.bot_token ?? "").slice(-6)}` },
  ];

  return (
    <div className="mx-auto max-w-3xl p-6 text-gray-900 dark:text-zinc-100">
      <h1 className="mb-1 text-lg font-semibold">{clone.name} — Info</h1>
      <p className="mb-5 text-sm text-gray-500 dark:text-white/50">Connection, business account, and Stars.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <span className="text-sm text-gray-500 dark:text-white/50">{r.label}</span>
            <span className={"text-sm font-semibold " + (r.accent === "good" ? "text-green-600" : r.accent === "bad" ? "text-red-600" : "")}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
