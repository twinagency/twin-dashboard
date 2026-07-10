import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fmtNum } from "@/lib/money";
import StarAmount from "@/components/StarAmount";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { setCredits, resetCounters, toggleActive, deleteUser } from "./actions";

export const dynamic = "force-dynamic";

function ago(ts: string | null): string {
  if (!ts) return "—";
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function dateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function FanDetailPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id, userId } = await params;

  const [cloneRes, userRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name").eq("id", id).maybeSingle(),
    supabaseAdmin.from("users").select("*").eq("id", userId).maybeSingle(),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (userRes.error) throw new Error(userRes.error.message);
  if (!cloneRes.data || !userRes.data) notFound();

  const clone = cloneRes.data as { id: string; name: string };
  const u = userRes.data as any;

  const [purchasesRes, historyRes] = await Promise.all([
    supabaseAdmin
      .from("star_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("paid_at", { ascending: false }),
    supabaseAdmin
      .from("chat_history")
      .select("role, content, created_at")
      .eq("clone_id", id)
      .eq("telegram_id", u.telegram_id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const purchases = (purchasesRes.data ?? []) as any[];
  const history = ((historyRes.data ?? []) as any[]).slice().reverse(); // oldest → newest
  const totalStars = purchases.reduce((s, p) => s + (p.amount_stars ?? 0), 0);
  const isPaying = purchases.length > 0 || (u.total_messages_purchased ?? 0) > 0;

  const cardCls = "rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900";

  const stats: { label: string; value: React.ReactNode }[] = [
    {
      label: "Credits left",
      value: (
        <span className={u.message_credits <= 0 ? "text-red-500" : u.message_credits <= 5 ? "text-yellow-500" : ""}>
          {fmtNum(u.message_credits)}
        </span>
      ),
    },
    { label: "Total spent", value: totalStars > 0 ? <StarAmount stars={totalStars} /> : "—" },
    { label: "Purchases", value: fmtNum(purchases.length) },
    { label: "Messages sent", value: fmtNum(u.total_messages_sent ?? 0) },
    { label: "Messages bought", value: fmtNum(u.total_messages_purchased ?? 0) },
    { label: "First seen", value: <span title={dateTime(u.first_seen_at)}>{ago(u.first_seen_at)}</span> },
    { label: "Last active", value: <span title={dateTime(u.last_message_received)}>{ago(u.last_message_received)}</span> },
    { label: "Telegram ID", value: <span className="font-mono text-sm">{u.telegram_id}</span> },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-400 dark:text-neutral-500">
        <Link href="/clones" className="hover:text-gray-900 dark:hover:text-neutral-100">Clones</Link>
        <span>/</span>
        <Link href={`/clones/${id}`} className="hover:text-gray-900 dark:hover:text-neutral-100">{clone.name}</Link>
        <span>/</span>
        <Link href={`/clones/${id}/fans`} className="hover:text-gray-900 dark:hover:text-neutral-100">Fans</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-neutral-100">{u.name ?? "Unknown"}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{u.name ?? <span className="text-gray-400 dark:text-neutral-500">Unknown</span>}</h1>
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-medium " +
            (isPaying
              ? "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300"
              : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400")
          }
        >
          {isPaying ? "Paying fan" : "Free user"}
        </span>
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs " +
            (u.is_active
              ? "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300"
              : "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500")
          }
        >
          {u.is_active ? "active" : "inactive"}
        </span>
      </div>

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`${cardCls} p-4`}>
            <div className="text-xs text-gray-400 dark:text-neutral-500">{s.label}</div>
            <div className="mt-1 text-lg font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className={`${cardCls} mb-6 p-5`}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">Controls</h2>
        <div className="flex flex-col gap-4">
          {/* Set / reset credits */}
          <form action={setCredits} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="cloneId" value={id} />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-gray-400 dark:text-neutral-500">Message credits</span>
              <input
                name="credits"
                type="number"
                min={0}
                defaultValue={u.message_credits}
                className="w-32 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-light dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
            <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition">
              Save credits
            </button>
          </form>

          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-neutral-800">
            {/* Reset credits to 0 */}
            <form action={setCredits}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <input type="hidden" name="credits" value="0" />
              <ConfirmSubmit
                message="Set this fan's message credits to 0?"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 transition"
              >
                Reset credits to 0
              </ConfirmSubmit>
            </form>

            {/* Reset lifetime counters */}
            <form action={resetCounters}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <ConfirmSubmit
                message="Reset lifetime counters (messages sent + bought) to 0? This does not change credits or purchase history."
                className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 transition"
              >
                Reset counters
              </ConfirmSubmit>
            </form>

            {/* Toggle active */}
            <form action={toggleActive}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
              <button type="submit" className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 transition">
                {u.is_active ? "Mark inactive" : "Mark active"}
              </button>
            </form>

            {/* Delete */}
            <form action={deleteUser} className="ml-auto">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <input type="hidden" name="telegramId" value={u.telegram_id} />
              <ConfirmSubmit
                message={`Permanently delete ${u.name ?? "this fan"}? This removes the user, their purchase records and entire chat history. This cannot be undone.`}
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition"
              >
                Delete user
              </ConfirmSubmit>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Purchases */}
        <div className={`${cardCls} p-5`}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
            Purchases {purchases.length > 0 && <span className="text-gray-400 dark:text-neutral-500">({purchases.length})</span>}
          </h2>
          {purchases.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400 dark:text-neutral-500">No purchases yet.</div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-neutral-800">
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <div className="font-medium"><StarAmount stars={p.amount_stars} /></div>
                    <div className="text-xs text-gray-400 dark:text-neutral-500">{dateTime(p.paid_at)}</div>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (p.kind === "credits"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300"
                        : p.kind === "media"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300"
                          : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400")
                    }
                  >
                    {p.kind === "credits" ? "messages" : p.kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conversation */}
        <div className={`${cardCls} p-5`}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
            Recent conversation
          </h2>
          {history.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400 dark:text-neutral-500">No messages yet.</div>
          ) : (
            <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
              {history.map((m, i) => {
                const fan = m.role === "human";
                return (
                  <div key={i} className={"flex " + (fan ? "justify-end" : "justify-start")}>
                    <div
                      className={
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm " +
                        (fan
                          ? "bg-brand text-white rounded-br-sm"
                          : "bg-gray-100 text-gray-900 rounded-bl-sm dark:bg-neutral-800 dark:text-neutral-100")
                      }
                    >
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={"mt-0.5 text-[10px] " + (fan ? "text-white/60" : "text-gray-400 dark:text-neutral-500")}>
                        {dateTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
