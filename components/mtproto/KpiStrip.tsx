import type { FunnelCounts, OptOutReport } from "@/lib/mtproto/types";
import { Kpi, Notice } from "./kit";
import { num, pct, share } from "./view";

// The headline numbers, in plain words. Same figures as before (nothing is
// recomputed here); each has an ⓘ saying exactly what it counts. Stars use the
// house money colour. An unreadable opt-out count shows "?", never 0.
export default function KpiStrip({ funnel, optOuts }: { funnel: FunnelCounts; optOuts?: OptOutReport }) {
  const optErr = !optOuts || !!optOuts.error;
  const opted = optOuts?.total.optedOut ?? 0;
  return (
    <div className="space-y-3">
      {funnel.partial && (
        <Notice tone="warn">A paged read was cut short, so the figures below are lower bounds. The real numbers are at least this high.</Notice>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Kpi
          label="Eligible"
          tip="Silent fans chosen to be messaged, counting the hold-out group. Fans who are blocked, opted out, or wrote in the last 24 hours are not in here."
          value={num(funnel.eligible)}
          sub={funnel.holdout > 0 ? `${num(funnel.holdout)} held back to compare` : undefined}
        />
        <Kpi
          label="Contacted"
          tip="Fans who got a real re-engagement message. Each fan counts once, even if they were picked twice."
          value={num(funnel.contacted)}
          sub={funnel.eligible > 0 ? `${pct(share(funnel.contacted, funnel.eligible), 0)} of eligible` : undefined}
        />
        <Kpi
          label="Acknowledged"
          tip="Telegram accepted the message. This is not proof the fan saw or read it."
          value={num(funnel.acknowledged)}
          sub={funnel.contacted > 0 ? `${pct(share(funnel.acknowledged, funnel.contacted), 0)} of contacted` : undefined}
        />
        <Kpi
          label="Replies"
          tip="Fans who answered one of these messages."
          value={num(funnel.replied)}
          sub={funnel.acknowledged > 0 ? `${pct(share(funnel.replied, funnel.acknowledged), 0)} of acknowledged` : undefined}
        />
        <Kpi
          label="Buyers"
          tip="Fans who replied and then bought within 7 days. A purchase with no reply is not counted here, so this is a careful number, not an inflated one."
          value={num(funnel.bought)}
          sub={funnel.replied > 0 ? `${pct(share(funnel.bought, funnel.replied), 0)} of repliers` : undefined}
        />
        <Kpi
          label="Stars"
          tip="Stars spent by those buyers within 7 days. This is observed spending, not profit."
          value={`${num(funnel.stars)} ⭐`}
          tone="good"
        />
        <div className="col-span-2 sm:col-span-1">
          <Kpi
            label="Opt-outs"
            tip="Fans who told us to stop after being messaged. Watch this one: a spike pauses the creator automatically."
            value={optErr ? "?" : num(opted)}
            tone={!optErr && opted > 0 ? "crit" : "neutral"}
            sub={optErr ? "could not be read" : optOuts!.total.contacted > 0 ? `${pct(optOuts!.total.rate)} of contacted` : "nobody contacted yet"}
          />
        </div>
      </div>
    </div>
  );
}
