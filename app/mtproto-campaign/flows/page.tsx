import Link from "next/link";
import { getCreators } from "@/components/mtproto/data";
import { EmptyBlock, Notice, Panel, StatusPill } from "@/components/mtproto/kit";
import { num } from "@/components/mtproto/view";
import { Info } from "@/components/clone/fields";
import { flowStatsMany, getFlowsGlobalSwitch, listFlows } from "@/lib/mtproto/flows";

export const dynamic = "force-dynamic";

// Flows tab: what happens after a fan replies to an MTProto opener. Reads
// only. Every read tolerates the flows tables not existing yet.
export default async function FlowsPage() {
  const [list, global, creators] = await Promise.all([listFlows(), getFlowsGlobalSwitch(), getCreators()]);
  const flows = list.data;
  const { stats } = await flowStatsMany(flows.map((f) => f.id));
  const girl = new Map(creators.map((c) => [c.id, c.name]));
  const globalOn = global.on === true;

  return (
    <div className="space-y-4">
      {!list.installed && (
        <Notice tone="info" title="Flows are not installed yet">
          The database migration for flows has not been applied. Nothing here can run until it is.
        </Notice>
      )}
      {list.error && <Notice tone="crit">Could not read flows: {list.error}</Notice>}

      <Panel
        title={
          <span className="flex items-center gap-2">
            Follow-up flows
            <StatusPill tone={globalOn ? "good" : "neutral"} title="App setting mtproto_flows_enabled, read only here">
              Global switch: {global.on === null ? "unknown" : globalOn ? "On" : "Off"}
            </StatusPill>
          </span>
        }
        tip="A flow is a chain of steps the normal bot runs after a fan replies to an MTProto opener. It only runs when the global switch AND the flow's own switch are both on. The global switch is not set from this page."
        actions={
          list.installed ? (
            <Link href="/mtproto-campaign/flows/new" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink">
              New flow
            </Link>
          ) : undefined
        }
      >
        {flows.length === 0 ? (
          <EmptyBlock icon="⇢" title="No flows yet" hint={list.installed ? "Create one, then pick it on a new run under Follow-up flow." : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Girl</th>
                  <th className="py-2 pr-3 text-right">Steps</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      Results
                      <Info text="Fans who entered, fans who replied, purchases after a step, and Stars from those purchases." />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {flows.map((f) => {
                  const s = stats.get(f.id);
                  const bought = s ? Object.values(s.steps).reduce((n, x) => n + x.purchased, 0) : 0;
                  const live = f.enabled && globalOn;
                  return (
                    <tr key={f.id}>
                      <td className="py-2.5 pr-3">
                        <Link href={`/mtproto-campaign/flows/${f.id}`} className="font-semibold text-ink hover:underline">
                          {f.name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{f.cloneId ? (girl.get(f.cloneId) ?? "unknown girl") : "any girl"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{f.steps.length}</td>
                      <td className="py-2.5 pr-3">
                        <StatusPill tone={live ? "good" : "neutral"} dot title={f.enabled && !globalOn ? "Switched on, but the global switch is off, so nothing runs." : undefined}>
                          {live ? "On" : "Off"}
                        </StatusPill>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {s && (s.enrolled > 0 || s.replied > 0 || bought > 0) ? (
                          <>
                            <b className="tabular-nums text-ink">{num(s.enrolled)}</b> in, <b className="tabular-nums text-ink">{num(s.replied)}</b> replied, <b className="tabular-nums text-ink">{num(bought)}</b> bought,{" "}
                            <b className="tabular-nums text-good">{num(s.stars)}</b> Stars
                          </>
                        ) : (
                          "no activity"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
