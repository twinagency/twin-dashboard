import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fmtNum } from "@/lib/money";
import StarAmount from "@/components/StarAmount";

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

export default async function FansPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const { id } = await params;
  const { q = "", sort = "last_message_received" } = await searchParams;

  const [cloneRes, usersRes, purchasesRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug").eq("id", id).maybeSingle(),
    supabaseAdmin
      .from("users")
      .select("*")
      .eq("clone_id", id)
      .order(
        sort === "credits" ? "message_credits" :
        sort === "messages" ? "total_messages_sent" :
        sort === "joined" ? "first_seen_at" :
        "last_message_received",
        { ascending: false, nullsFirst: false }
      ),
    supabaseAdmin
      .from("star_transactions")
      .select("user_id, amount_stars")
      .eq("clone_id", id),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (!cloneRes.data) notFound();

  const clone = cloneRes.data as { id: string; name: string; slug: string };
  const allUsers = (usersRes.data ?? []) as any[];

  // Stars spent per user
  const starsByUser = new Map<string, number>();
  for (const p of purchasesRes.data ?? []) {
    starsByUser.set(p.user_id, (starsByUser.get(p.user_id) ?? 0) + p.amount_stars);
  }

  const filtered = q
    ? allUsers.filter(
        (u) =>
          u.name?.toLowerCase().includes(q.toLowerCase()) ||
          String(u.telegram_id).includes(q)
      )
    : allUsers;

  const active7d = allUsers.filter(
    (u) => u.last_message_received && Date.now() - new Date(u.last_message_received).getTime() < 7 * 86400000
  ).length;

  const totalMessages = allUsers.reduce((s, u) => s + (u.total_messages_sent ?? 0), 0);
  const buyers = allUsers.filter((u) => (u.total_messages_purchased ?? 0) > 0).length;

  const SORTS = [
    { key: "last_message_received", label: "Last active" },
    { key: "joined", label: "Joined" },
    { key: "messages", label: "Messages" },
    { key: "credits", label: "Credits" },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-sm text-gray-400 dark:text-neutral-500">
        <Link href="/clones" className="hover:text-gray-900 dark:hover:text-neutral-100">Clones</Link>
        <span>/</span>
        <Link href={`/clones/${id}`} className="hover:text-gray-900 dark:hover:text-neutral-100">{clone.name}</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-neutral-100">Fans</span>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">
        {clone.name} <span className="text-gray-400 dark:text-neutral-500">/ Fans</span>
      </h1>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total fans", value: fmtNum(allUsers.length) },
          { label: "Active 7d", value: fmtNum(active7d) },
          { label: "Total messages", value: fmtNum(totalMessages) },
          { label: "Buyers", value: fmtNum(buyers) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
            <div className="text-xs text-gray-400 dark:text-neutral-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + sort */}
      <form className="mb-4 grid gap-2 sm:flex sm:gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or Telegram ID…"
          className="flex-1 rounded-md border border-gray-300 bg-gray-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500 px-3 py-2 text-sm outline-none focus:border-brand-light"
        />
        <div className="flex gap-2">
          <select
            name="sort"
            defaultValue={sort}
            className="flex-1 rounded-md border border-gray-300 bg-white dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500 px-3 py-2 text-sm outline-none focus:border-brand-light"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-gray-200 dark:border-neutral-800 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-neutral-900 transition"
          >
            Filter
          </button>
        </div>
      </form>

      {/* Mobile cards */}
      <div className="grid gap-2 sm:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center text-sm text-gray-400 dark:text-neutral-500">
            {q ? "No fans match that search." : "No fans yet."}
          </div>
        ) : filtered.map((u) => (
          <Link key={u.id} href={`/clones/${id}/fans/${u.id}`} className="block rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 hover:border-gray-300 dark:hover:border-neutral-700 transition">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-medium">{u.name ?? <span className="text-gray-400 dark:text-neutral-500">Unknown</span>}</span>
                <span className="ml-2 text-xs text-gray-400 dark:text-neutral-500">{u.telegram_id}</span>
              </div>
              <span className={
                "rounded-full px-2 py-0.5 text-xs shrink-0 " +
                (u.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 dark:bg-neutral-900 text-gray-400 dark:text-neutral-500")
              }>
                {u.is_active ? "active" : "inactive"}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-neutral-500">
              <span><span className={u.message_credits <= 0 ? "text-red-400" : u.message_credits <= 5 ? "text-yellow-400" : "text-gray-700 dark:text-neutral-200"}>{u.message_credits}</span> credits</span>
              <span>{fmtNum(u.total_messages_sent)} msgs</span>
              {starsByUser.get(u.id) && <span><StarAmount stars={starsByUser.get(u.id)!} /> spent</span>}
              <span>{ago(u.last_message_received)}</span>
            </div>
          </Link>
        ))}
        {filtered.length > 0 && (
          <div className="px-1 py-1 text-xs text-gray-400 dark:text-neutral-500">
            {filtered.length} fan{filtered.length !== 1 ? "s" : ""}{q ? ` matching "${q}"` : ""}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-900 text-left text-gray-400 dark:text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fan</th>
              <th className="px-4 py-3 font-medium">Credits</th>
              <th className="px-4 py-3 font-medium">Messages</th>
              <th className="px-4 py-3 font-medium">Spent</th>
              <th className="px-4 py-3 font-medium">Last active</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400 dark:text-neutral-500">
                  {q ? "No fans match that search." : "No fans yet."}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-t border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-900">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name ?? <span className="text-gray-400 dark:text-neutral-500">Unknown</span>}</div>
                    <div className="text-xs text-gray-400 dark:text-neutral-500">{u.telegram_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={u.message_credits <= 0 ? "text-red-400" : u.message_credits <= 5 ? "text-yellow-400" : ""}>
                      {u.message_credits}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-neutral-400">{fmtNum(u.total_messages_sent)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-neutral-400">
                    {starsByUser.get(u.id) ? <StarAmount stars={starsByUser.get(u.id)!} /> : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-neutral-400 text-xs">{ago(u.last_message_received)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-neutral-400 text-xs">{ago(u.first_seen_at)}</td>
                  <td className="px-4 py-3">
                    <span className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (u.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 dark:bg-neutral-900 text-gray-400 dark:text-neutral-500")
                    }>
                      {u.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/clones/${id}/fans/${u.id}`} className="text-sm text-brand hover:underline">
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="border-t border-gray-200 dark:border-neutral-800 px-4 py-2 text-xs text-gray-400 dark:text-neutral-500">
            {filtered.length} fan{filtered.length !== 1 ? "s" : ""}{q ? ` matching "${q}"` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
