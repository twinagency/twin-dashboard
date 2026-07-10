import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  created_at: string;
  kind: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  ok: boolean;
  error: string | null;
  clones: { slug: string } | null;
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ errors?: string }>;
}) {
  const { errors } = await searchParams;
  const onlyErrors = errors === "1";

  let q = supabaseAdmin
    .from("usage_events")
    .select("id,created_at,kind,model,prompt_tokens,completion_tokens,cost_usd,ok,error,clones(slug)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (onlyErrors) q = q.eq("ok", false);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const spend = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const errCount = rows.filter((r) => !r.ok).length;

  return (
    <div className="mx-auto max-w-6xl p-6 text-gray-900 dark:text-zinc-100">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Logs — AI &amp; voice calls</h1>
        <div className="flex gap-2 text-xs">
          <a href="/logs" className={`rounded-md border px-3 py-1.5 ${!onlyErrors ? "border-gray-900 dark:border-white" : "border-gray-300 dark:border-white/20"}`}>All</a>
          <a href="/logs?errors=1" className={`rounded-md border px-3 py-1.5 ${onlyErrors ? "border-red-500 text-red-600" : "border-gray-300 dark:border-white/20"}`}>Errors only</a>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Calls (last 300)" value={String(rows.length)} />
        <Stat label="Spend shown" value={`$${spend.toFixed(4)}`} />
        <Stat label="Errors" value={String(errCount)} accent={errCount > 0} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/50">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Clone</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-gray-100 dark:border-white/5 ${!r.ok ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-white/50">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.clones?.slug ?? "—"}</td>
                <td className="px-3 py-2 uppercase">{r.kind}</td>
                <td className="px-3 py-2">{r.model ?? "—"}</td>
                <td className="px-3 py-2 text-right">{r.prompt_tokens != null ? `${r.prompt_tokens}/${r.completion_tokens ?? 0}` : "—"}</td>
                <td className="px-3 py-2 text-right">{r.cost_usd != null ? `$${Number(r.cost_usd).toFixed(4)}` : "—"}</td>
                <td className="px-3 py-2">
                  {r.ok ? <span className="text-green-600">ok</span> : <span className="text-red-600" title={r.error ?? ""}>{(r.error ?? "error").slice(0, 60)}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No calls logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs text-gray-500 dark:text-white/50">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
