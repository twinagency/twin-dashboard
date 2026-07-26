import dns from "node:dns";
import net from "node:net";
import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { setCloneScope } from "@/app/actions/clone-scope";
import { getStarBalance } from "@/lib/star-balance";
import FanAvatar from "@/components/FanAvatar";
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

// The human Business account this bot is wired into (name/username/id + whether
// the connection is live), via getBusinessConnection with any fan's stored
// business_connection_id. Null when the clone runs as a plain bot (no biz link).
type BizAccount = { id: number; name: string; username: string | null; enabled: boolean };
async function getBusinessAccount(token: string, bcid: string): Promise<BizAccount | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getBusinessConnection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_connection_id: bcid }),
    });
    const j = await r.json();
    if (!j.ok || !j.result?.user) return null;
    const u = j.result.user;
    return {
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" "),
      username: u.username ?? null,
      enabled: j.result.is_enabled !== false,
    };
  } catch {
    return null;
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
  const [{ data: clones }, { data: users }, { data: tx }] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug,status").order("created_at", { ascending: true }),
    supabaseAdmin.from("users").select("clone_id,total_messages_purchased"),
    supabaseAdmin.from("star_transactions").select("clone_id,amount_stars"),
  ]);

  const userList = (users ?? []) as { clone_id: string; total_messages_purchased: number | null }[];
  const txList = (tx ?? []) as { clone_id: string; amount_stars: number | null }[];

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
    <div className="text-ink">
      <h1 className="mb-1 text-2xl font-semibold">Fleet info</h1>
      <p className="mb-5 text-sm text-muted">
        Every bot at a glance. Pick one to see its live connection &amp; Stars balance.
      </p>

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
                <TableCell className="font-medium">{c.name} <span className="text-muted">/ {c.slug}</span></TableCell>
                <TableCell>
                  <Badge variant="outline" className={c.status === "active" ? "border-good/30 text-good" : "text-muted"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fansByClone.get(c.id) ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{buyersByClone.get(c.id) ?? 0}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-good">{starsByClone.get(c.id) ?? 0} ⭐</TableCell>
                <TableCell className="text-right">
                  <form action={setCloneScope.bind(null, c.id)}>
                    <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-accent">Info →</Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted">No clones yet.</TableCell></TableRow>
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
  if (!clone) return <div className="text-muted">Clone not found.</div>;

  const [me, starBalance, { data: users }] = await Promise.all([
    getMe(clone.bot_token),
    getStarBalance(cloneId, clone.bot_token),
    supabaseAdmin.from("users").select("business_connection_id,total_messages_purchased,last_message_received").eq("clone_id", cloneId),
  ]);

  const userList = (users ?? []) as { business_connection_id: string | null; total_messages_purchased: number; last_message_received: string | null }[];
  // Three genuinely different figures, see lib/star-balance.ts for how each is
  // derived — never collapse them into one "revenue" number:
  const { lifetimeStars, totalBalanceStars, availableStars, pendingStars } = starBalance;
  const buyers = userList.filter((u) => (u.total_messages_purchased ?? 0) > 0).length;

  // Most recently active fan's connection id is the freshest handle to the biz account.
  const bcid = userList
    .filter((u) => u.business_connection_id)
    .sort((a, b) => (b.last_message_received ?? "").localeCompare(a.last_message_received ?? ""))[0]
    ?.business_connection_id;
  const biz = bcid ? await getBusinessAccount(clone.bot_token, bcid) : null;

  const rows: { label: string; value: string; accent?: "good" | "bad" | "money"; hint?: string }[] = [
    { label: "Bot", value: me.username ? `@${me.username}` : "-" },
    { label: "Reachable", value: me.ok ? "yes" : "no, check token/network", accent: me.ok ? "good" : "bad" },
    { label: "Status", value: clone.status, accent: clone.status === "active" ? "good" : undefined },
    {
      label: "Available to withdraw",
      value: availableStars != null ? `${availableStars} ⭐` : "unavailable",
      accent: availableStars != null ? "money" : undefined,
      hint: "Stars that have cleared Telegram's 21-day maturation hold and can be withdrawn right now. Always less than or equal to total balance.",
    },
    {
      label: "Pending (21-day hold)",
      value: pendingStars != null ? `${pendingStars} ⭐` : "unavailable",
      hint: "Stars paid to this bot in the last 21 days. Telegram holds every Star for 21 days after it's earned before it can be withdrawn, so this is real money that simply isn't liquid yet.",
    },
    {
      label: "Total balance",
      value: totalBalanceStars != null ? `${totalBalanceStars} ⭐` : "unavailable",
      accent: totalBalanceStars != null ? "money" : undefined,
      hint: "Every Star currently sitting in this bot's Telegram wallet, matured and pending combined, minus anything already withdrawn or spent. Read directly from Telegram (getMyStarBalance).",
    },
    {
      label: "Lifetime proceeds",
      value: `${lifetimeStars} ⭐`,
      accent: "money",
      hint: "Every Star this bot has ever been paid, gross, forever. This number never goes down, it is not a balance and not what can be withdrawn today.",
    },
    { label: "Fans", value: String(userList.length) },
    { label: "Buyers", value: String(buyers) },
    { label: "Bot token", value: `••••${(clone.bot_token ?? "").slice(-6)}` },
  ];

  return (
    <div className="mx-auto max-w-3xl text-ink">
      <div className="mb-2 flex items-center justify-end">
        <form action={setCloneScope.bind(null, null)}>
          <Button type="submit" variant="ghost" size="sm">← All bots</Button>
        </form>
      </div>
      <p className="mb-5 text-sm text-muted">Connection, business account, and Stars.</p>

      {/* The Business account this bot lives inside - face, name, live state. */}
      <Card className="mb-3 flex-row items-center gap-3 px-4 py-3">
        {biz ? (
          <>
            <FanAvatar cloneId={clone.id} telegramId={biz.id} name={biz.name} className="h-11 w-11 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{biz.name}</div>
              <div className="truncate text-xs text-muted">
                {biz.username ? `@${biz.username} · ` : ""}Telegram Business account
              </div>
            </div>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                (biz.enabled ? "bg-good/15 text-good" : "bg-crit/15 text-crit")
              }
            >
              {biz.enabled ? "Connected" : "Disconnected"}
            </span>
          </>
        ) : (
          <div className="text-sm text-muted">No Business account detected yet. It shows up after the first fan message arrives through one.</div>
        )}
      </Card>

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

      {/* Manage-the-business-account controls: the Bot API supports these
          (setBusinessAccountName/Username/ProfilePhoto, postStory) but none are
          wired yet. Placeholder so the roadmap is visible where it will live. */}
      <Card className="mt-3 border-dashed p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold">Manage business account</span>
          <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-yellow-500">
            Coming soon
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Change profile photo", "Change name", "Change username", "Post story", "Edit bio"].map((f) => (
            <span key={f} className="cursor-not-allowed rounded-full border border-line px-2.5 py-1 text-xs text-muted/60">
              {f}
            </span>
          ))}
        </div>
      </Card>
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
