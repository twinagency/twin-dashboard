import { MutationForm } from "@/components/DashboardAccessProvider";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fmtNum } from "@/lib/money";
import StarAmount from "@/components/StarAmount";
import SpendTierBadge from "@/components/SpendTierBadge";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { setCredits, resetCounters, toggleActive, deleteUser } from "./actions";

export const dynamic = "force-dynamic";

function ago(ts: string | null): string {
  if (!ts) return "-";
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function dateTime(ts: string | null): string {
  if (!ts) return "-";
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

  const [purchasesRes, historyRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from("star_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("paid_at", { ascending: false }),
    supabaseAdmin
      .from("chat_history")
      .select("role, content, created_at, meta")
      .eq("clone_id", id)
      .eq("telegram_id", u.telegram_id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabaseAdmin.from("fan_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const purchases = (purchasesRes.data ?? []) as any[];
  const history = ((historyRes.data ?? []) as any[]).slice().reverse(); // oldest → newest
  const profile = (profileRes.data ?? null) as any;
  const totalStars = purchases.reduce((s, p) => s + (p.amount_stars ?? 0), 0);
  const isPaying = purchases.length > 0 || (u.total_messages_purchased ?? 0) > 0;

  const cardCls = "rounded-lg border border-line bg-panel";

  const stats: { label: string; value: React.ReactNode }[] = [
    {
      label: "Credits left",
      value: (
        <span className={u.message_credits <= 0 ? "text-crit" : u.message_credits <= 5 ? "text-warn" : ""}>
          {fmtNum(u.message_credits)}
        </span>
      ),
    },
    { label: "Total spent", value: totalStars > 0 ? <StarAmount stars={totalStars} /> : "-" },
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
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/clones" className="hover:text-ink">Creators</Link>
        <span>/</span>
        <Link href={`/clones/${id}`} className="creator-name hover:text-ink">{clone.name}</Link>
        <span>/</span>
        <Link href="/users" className="hover:text-ink">Fans</Link>
        <span>/</span>
        <span className="text-ink">{u.name ?? "Unknown"}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{u.name ?? <span className="text-muted">Unknown</span>}</h1>
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-medium " +
            (isPaying
              ? "bg-good/15 text-good"
              : "bg-muted/10 text-muted")
          }
        >
          {isPaying ? "Paying fan" : "Free user"}
        </span>
        <SpendTierBadge tier={u.spend_tier} />
        {u.is_high_spender && (
          <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-medium text-warn">
            ⚡ Power spender
          </span>
        )}
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs " +
            (u.is_active
              ? "bg-good/15 text-good"
              : "bg-muted/10 text-muted")
          }
        >
          {u.is_active ? "active" : "inactive"}
        </span>
      </div>

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`${cardCls} p-4`}>
            <div className="text-xs text-muted">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Knowledge / profile - what the bot has learned about this fan */}
      {(() => {
        const interests: string[] = Array.isArray(profile?.interests) ? profile.interests : [];
        const details: [string, any][] = profile?.details && typeof profile.details === "object"
          ? Object.entries(profile.details).filter(([, v]) => v != null && String(v).trim() !== "")
          : [];
        const hasAnything =
          profile && (profile.summary?.trim() || interests.length > 0 || details.length > 0 || profile.preferences?.trim());
        const prettyKey = (k: string) =>
          k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <div className={`${cardCls} mb-6 p-5`}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Knowledge / profile
              </h2>
              {profile?.extracted_msg_count != null && (
                <span className="text-xs text-muted">
                  from {fmtNum(profile.extracted_msg_count)} message{profile.extracted_msg_count === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {!hasAnything ? (
              <div className="py-6 text-center text-sm text-muted">
                Nothing collected yet. The bot builds this dossier automatically as this fan chats.
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {profile.summary?.trim() && (
                  <div>
                    <div className="mb-1 text-xs text-muted">Summary</div>
                    <p className="text-sm leading-relaxed text-ink">{profile.summary}</p>
                  </div>
                )}

                {interests.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs text-muted">Interests</div>
                    <div className="flex flex-wrap gap-1.5">
                      {interests.map((it, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-muted/10 px-2.5 py-0.5 text-xs text-ink"
                        >
                          {it}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {details.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs text-muted">Details</div>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {details.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-line pb-1.5 text-sm">
                          <dt className="text-muted">{prettyKey(k)}</dt>
                          <dd className="text-right font-medium text-ink">
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {profile.preferences?.trim() && (
                  <div>
                    <div className="mb-1 text-xs text-muted">Preferences</div>
                    <p className="text-sm leading-relaxed text-ink">{profile.preferences}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Monetization sequence state (migration 056) — read only. Debugging aid:
          is there an open offer sitting unpaid right now, and where is this fan
          in the post-lock proactive re-engagement sequence. The other two new
          columns (offer_reengaged, pre_lock_tease_sent) are one-shot internal
          fire-once guards whose state is already implied by comparing the
          timestamps below against the clone's own configured windows, so they
          were left out rather than adding two bare, easily-misread booleans. */}
      {(u.last_offer_at || u.last_reveal_at || u.postlock_locked_at || (u.postlock_stage ?? 0) > 0) && (
        <div className={`${cardCls} mb-6 p-5`}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Monetization sequence state
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Last locked offer sent</dt>
              <dd className="mt-0.5 text-sm font-medium" title={dateTime(u.last_offer_at)}>{ago(u.last_offer_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Last paid reveal</dt>
              <dd className="mt-0.5 text-sm font-medium" title={dateTime(u.last_reveal_at)}>{ago(u.last_reveal_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Post-lock stage</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {u.postlock_stage === 2
                  ? "2 · graceful goodbye sent"
                  : u.postlock_stage === 1
                    ? "1 · first check-in sent"
                    : "0 · nothing sent"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Wall hit at (this episode)</dt>
              <dd className="mt-0.5 text-sm font-medium" title={dateTime(u.postlock_locked_at)}>{ago(u.postlock_locked_at)}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Controls */}
      <div className={`${cardCls} mb-6 p-5`}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Controls</h2>
        <div className="flex flex-col gap-4">
          {/* Set / reset credits */}
          <MutationForm action={setCredits} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="cloneId" value={id} />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">Message credits</span>
              <input
                name="credits"
                type="number"
                min={0}
                defaultValue={u.message_credits}
                className="w-32 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep transition">
              Save credits
            </button>
          </MutationForm>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {/* Reset credits to 0 */}
            <MutationForm action={setCredits}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <input type="hidden" name="credits" value="0" />
              <ConfirmSubmit
                message="Set this fan's message credits to 0?"
                className="rounded-md border border-line px-3 py-2 text-sm hover:bg-bg transition"
              >
                Reset credits to 0
              </ConfirmSubmit>
            </MutationForm>

            {/* Reset lifetime counters */}
            <MutationForm action={resetCounters}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <ConfirmSubmit
                message="Reset lifetime counters (messages sent + bought) to 0? This does not change credits or purchase history."
                className="rounded-md border border-line px-3 py-2 text-sm hover:bg-bg transition"
              >
                Reset counters
              </ConfirmSubmit>
            </MutationForm>

            {/* Toggle active */}
            <MutationForm action={toggleActive}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
              <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm hover:bg-bg transition">
                {u.is_active ? "Mark inactive" : "Mark active"}
              </button>
            </MutationForm>

            {/* Delete */}
            <MutationForm adminOnly action={deleteUser} className="ml-auto">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="cloneId" value={id} />
              <input type="hidden" name="telegramId" value={u.telegram_id} />
              <ConfirmSubmit
                message={`Permanently delete ${u.name ?? "this fan"}? This removes the user, their purchase records and entire chat history. This cannot be undone.`}
                className="rounded-md border border-crit/30 bg-crit/10 px-3 py-2 text-sm font-medium text-crit hover:bg-crit/20 transition"
              >
                Delete user
              </ConfirmSubmit>
            </MutationForm>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Purchases */}
        <div className={`${cardCls} p-5`}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Purchases {purchases.length > 0 && <span className="text-muted">({purchases.length})</span>}
          </h2>
          {purchases.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">No purchases yet.</div>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <div className="font-medium"><StarAmount stars={p.amount_stars} /></div>
                    <div className="text-xs text-muted">{dateTime(p.paid_at)}</div>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (p.kind === "credits"
                        ? "bg-accent/15 text-accent"
                        : p.kind === "media"
                          ? "bg-info/15 text-info"
                          : "bg-muted/10 text-muted")
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
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Recent conversation
          </h2>
          {history.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">No messages yet.</div>
          ) : (
            <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
              {history.map((m, i) => {
                // Bot (her) = blue, RIGHT. Fan = grey, left. Same as /users inbox.
                const fan = m.role === "human";
                const isMtproto = m.meta?.source === "mtproto";
                return (
                  <div key={i} className={"flex " + (fan ? "justify-start" : "justify-end")}>
                    <div
                      className={
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm " +
                        (fan
                          ? "bg-muted/10 text-ink rounded-bl-sm"
                          : "bg-accent text-white rounded-br-sm")
                      }
                    >
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={"mt-0.5 flex items-center gap-1.5 text-[10px] " + (fan ? "text-muted" : "text-white/60")}>
                        <span>{dateTime(m.created_at)}</span>
                        {isMtproto && <span className="rounded bg-white/20 px-1.5 py-0.5 font-medium">MTProto</span>}
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

