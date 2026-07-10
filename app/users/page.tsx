import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type U = {
  id: string;
  clone_id: string;
  name: string | null;
  stated_name: string | null;
  username: string | null;
  total_messages_sent: number | null;
  total_messages_purchased: number | null;
  message_credits: number | null;
  last_message_received: string | null;
};

function ago(ts: string | null): string {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export default async function AllUsersPage() {
  const [{ data: userRows }, { data: cloneRows }] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id,clone_id,name,stated_name,username,total_messages_sent,total_messages_purchased,message_credits,last_message_received")
      .order("total_messages_purchased", { ascending: false })
      .limit(300),
    supabaseAdmin.from("clones").select("id,slug"),
  ]);
  const users = (userRows ?? []) as U[];
  const slugById = new Map((cloneRows ?? []).map((c) => [c.id, c.slug as string]));

  const buyers = users.filter((u) => (u.total_messages_purchased ?? 0) > 0).length;
  const totalBought = users.reduce((s, u) => s + (u.total_messages_purchased ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl p-6 text-gray-900 dark:text-zinc-100">
      <h1 className="mb-1 text-lg font-semibold">Users — top fans across the fleet</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-white/50">Ranked by message credits purchased. Showing up to 300.</p>

      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Fans shown" value={String(users.length)} />
        <Stat label="Buyers" value={String(buyers)} />
        <Stat label="Msg credits bought" value={String(totalBought)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/50">
            <tr>
              <th className="px-3 py-2">Fan</th>
              <th className="px-3 py-2">Bot</th>
              <th className="px-3 py-2 text-right">Bought</th>
              <th className="px-3 py-2 text-right">Sent</th>
              <th className="px-3 py-2 text-right">Credits</th>
              <th className="px-3 py-2 text-right">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 dark:border-white/5">
                <td className="px-3 py-2">
                  {u.stated_name ?? u.name ?? "—"}
                  {u.username ? <span className="ml-1 text-gray-400">@{u.username}</span> : null}
                </td>
                <td className="px-3 py-2">{slugById.get(u.clone_id) ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{u.total_messages_purchased ?? 0}</td>
                <td className="px-3 py-2 text-right">{u.total_messages_sent ?? 0}</td>
                <td className="px-3 py-2 text-right">{u.message_credits ?? 0}</td>
                <td className="px-3 py-2 text-right text-gray-500 dark:text-white/50">{ago(u.last_message_received)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No fans yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs text-gray-500 dark:text-white/50">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
