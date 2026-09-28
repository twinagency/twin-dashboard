import { cloneBotToken } from "@/lib/clone-credentials";
import { getDashboardAccess } from "@/lib/dashboard-access";
import CloneScopeForm from "@/components/CloneScopeForm";
import dns from "node:dns";
import net from "node:net";
import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { setCloneScope } from "@/app/actions/clone-scope";
import { getStarBalance } from "@/lib/star-balance";
import { selectAllRows } from "@/lib/select-all";
import { dedupeStarRows } from "@/lib/star-dedupe";
import BusinessConnectionCard from "./BusinessConnectionCard";
import { Info } from "@/components/clone/fields";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Dead-IPv6 machine fix, same as api/avatar (idempotent, process-wide).
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

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


// Fleet-info page. "All clones" (no scope) shows one row per bot with a link
// that switches the global clone scope into it; scoped to one clone it shows
// that bot's live Telegram connection + Stars balance (used to be the separate
// /clones/[id]/info route — now the same page, switcher decides which view).
export default async function InfoPage() {
  const cloneId = await getCloneScope();
  if (cloneId) return <CloneInfo cloneId={cloneId} />;
  return <FleetInfo />;
}

async function FleetInfo() {
  // Both reads are unbounded fleet-wide scans (users is 80k+ rows) - a plain
  // .select() silently truncates at PostgREST's 1000 row cap with no error, so
  // this page's totals were wrong. selectAllRows pages past that cap, see its
  // header for the full failure mode.
  const [{ data: clones }, { rows: userList }, { rows: txListRaw }] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug,status").order("created_at", { ascending: true }),
    selectAllRows<{ clone_id: string; total_messages_purchased: number | null }>(
      supabaseAdmin.from("users").select("clone_id,total_messages_purchased"),
      { label: "fleet info users" },
    ),
    selectAllRows<{
      id: string;
      clone_id: string;
      telegram_id: number | null;
      kind: string | null;
      amount_stars: number | null;
      paid_at: string;
      invoice_payload: string | null;
    }>(
      supabaseAdmin.from("star_transactions").select("id,clone_id,telegram_id,kind,amount_stars,paid_at,invoice_payload"),
      { label: "fleet info star_transactions" },
    ),
  ]);
  // See lib/star-dedupe.ts: collapse double-recorded payments before summing.
  const txList = dedupeStarRows(txListRaw);

  const fansByClone = new Map<string, number>();
  const buyersByClone = new Map<string, number>();
  for (const u of userList) {
    fansByClone.set(u.clone_id, (fansByClone.get(u.clone_id) ?? 0) + 1);
    if ((u.total_messages_purchased ?? 0) > 0) buyersByClone.set(u.clone_id, (buyersByClone.get(u.clone_id) ?? 0) + 1);
  }
  const starsByClone = new Map<string, number>();
  for (const t of txList) {
    starsByClone.set(t.clone_id, (starsByClone.get(t.clone_id) ?? 0) + (Number(t.amount_stars) || 0));
  }

  const rows = (clones ?? []) as { id: string; name: string; slug: string; status: string }[];
  const totalFans = userList.length;
  const totalStars = txList.reduce((s, t) => s + (Number(t.amount_stars) || 0), 0);
  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="dashboard-page text-ink">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-semibold">
        Fleet info
        <Info text="Every bot at a glance. Pick one to see its live connection and Stars balance." />
      </h1>

      <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Bots" value={String(rows.length)} />
        <Stat label="Active" value={String(activeCount)} accent={activeCount > 0} />
        <Stat label="Fans (all)" value={String(totalFans)} />
        <Stat
          label="Lifetime proceeds"
          value={`${totalStars} ⭐`}
          money
          hint="Every Star ever paid to the fleet, gross, forever. Not a spendable balance and not what's available to withdraw right now, see a bot's own Info page for that."
        />
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fans</TableHead>
              <TableHead className="text-right">Buyers</TableHead>
              <TableHead className="text-right">Stars earned</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="creator-name font-medium">{c.name} <span className="text-muted">/ {c.slug}</span></TableCell>
                <TableCell>
                  <Badge variant="outline" className={c.status === "active" ? "border-good/30 text-good" : "text-muted"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fansByClone.get(c.id) ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{buyersByClone.get(c.id) ?? 0}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-good">{starsByClone.get(c.id) ?? 0} ⭐</TableCell>
                <TableCell className="text-right">
                  <CloneScopeForm cloneId={c.id}>
                    <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-accent">Info →</Button>
                  </CloneScopeForm>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted">No creators yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

async function CloneInfo({ cloneId }: { cloneId: string }) {
  const { data: clone } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,status,bot_token")
    .eq("id", cloneId)
    .maybeSingle();
  if (!clone) return <div className="text-muted">Creator not found.</div>;

  const token = await cloneBotToken(cloneId);
  const agency = await getDashboardAccess();
  // Same unbounded-read hazard as FleetInfo above, just scoped to one clone -
  // a fleet of ~80k users over ten clones averages well past the 1000 row cap
  // per clone too, so fan/buyer counts here were undercounted the same way.
  const [me, starBalance, { rows: userList }] = await Promise.all([
    getMe(token ?? ""),
    getStarBalance(cloneId, token ?? ""),
    selectAllRows<{ business_connection_id: string | null; total_messages_purchased: number; last_message_received: string | null }>(
      supabaseAdmin.from("users").select("business_connection_id,total_messages_purchased,last_message_received").eq("clone_id", cloneId),
      { label: "clone info users" },
    ),
  ]);

  // Two genuinely different figures, see lib/star-balance.ts for how each is
  // derived — never collapse them into one "revenue" number:
  const { lifetimeStars, totalBalanceStars } = starBalance;
  const buyers = userList.filter((u) => (u.total_messages_purchased ?? 0) > 0).length;


  const rows: { label: string; value: string; accent?: "good" | "bad" | "money"; hint?: string }[] = [
    { label: "Bot", value: me.username ? `@${me.username}` : "-" },
    { label: "Reachable", value: me.ok ? "yes" : "no, check token/network", accent: me.ok ? "good" : "bad" },
    { label: "Status", value: clone.status, accent: clone.status === "active" ? "good" : undefined },
    {
      label: "Total balance",
      value: totalBalanceStars != null ? `${totalBalanceStars} ⭐` : "unavailable",
      accent: totalBalanceStars != null ? "money" : undefined,
      hint: "Every Star currently sitting in this bot's Telegram wallet, minus anything already withdrawn or spent. Read directly from Telegram (getMyStarBalance).",
    },
    {
      label: "Lifetime proceeds",
      value: `${lifetimeStars} ⭐`,
      accent: "money",
      hint: "Every Star this bot has ever been paid, gross, forever. This number never goes down, it is not a balance and not what can be withdrawn today.",
    },
    { label: "Fans", value: String(userList.length) },
    { label: "Buyers", value: String(buyers) },
    { label: "Bot token", value: agency ? "Restricted" : `••••${(token ?? "").slice(-6)}` },
  ];

  return (
    <div className="dashboard-page mx-auto max-w-3xl text-ink">
      <div className="mb-2 flex items-center justify-end">
        <CloneScopeForm cloneId={null}>
          <Button type="submit" variant="ghost" size="sm">← All bots</Button>
        </CloneScopeForm>
      </div>
      <p className="mb-5 text-sm text-muted">Connection, business account, and Stars.</p>

      {/* The Business account this bot lives inside: face, name, live state and
          the rights it was granted. Read-only on purpose, the owner asked for
          the edit controls (set name/username/photo, post story) to come out
          for now, so this panel only ever reports, it never mutates. */}
      <BusinessConnectionCard cloneId={clone.id} />

      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.label} className="flex-row items-center justify-between px-4 py-3">
            <span className="flex items-center gap-1.5 text-sm text-muted">
              {r.label}
              {r.hint && <Info text={r.hint} />}
            </span>
            <span className={"text-sm font-semibold tabular-nums " + (r.accent === "good" ? "text-good" : r.accent === "bad" ? "text-crit" : r.accent === "money" ? "font-mono text-good" : "")}>{r.value}</span>
          </Card>
        ))}
      </div>

    </div>
  );
}

function Stat({ label, value, accent, money, hint }: { label: string; value: string; accent?: boolean; money?: boolean; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        {hint && <Info text={hint} />}
      </div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${money ? "text-good" : accent ? "text-good" : "text-ink"}`}>{value}</div>
    </Card>
  );
}

