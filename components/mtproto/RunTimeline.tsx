import { Panel, When } from "./kit";
import { timeAgo, type TimelineStep } from "./view";

const DOT: Record<TimelineStep["state"], string> = {
  done: "bg-good text-white",
  now: "bg-accent-2 text-white ring-4 ring-accent-2/20",
  todo: "bg-line text-muted",
  bad: "bg-crit text-white",
};
const MARK: Record<TimelineStep["state"], string> = { done: "✓", now: "●", todo: "", bad: "!" };

// What has happened to this run so far and what is still to come. Built from
// fields the run already has; nothing here reads anything new.
export default function RunTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Panel title="Timeline" tip="Every milestone of this run, in order. Grey steps have not happened yet.">
      <ol className="relative">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className={`absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px ${s.state === "done" ? "bg-good/40" : "bg-line"}`} />}
            <span aria-hidden className={`z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${DOT[s.state]}`}>{MARK[s.state]}</span>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm ${s.state === "todo" ? "text-muted" : "font-semibold text-ink"} ${s.state === "bad" ? "!text-crit" : ""}`}>{s.label}</div>
              <div className="text-xs text-muted">
                {s.at ? <When iso={s.at} relative={timeAgo(s.at)} /> : s.state === "now" ? "in progress" : "not yet"}
                {s.note ? ` · ${s.note}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
