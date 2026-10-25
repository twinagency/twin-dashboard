"use client";

// Screens the preview deliberately does not build.
//
// Two cases exist and they are different. `existing` is a surface that already
// ships in the Twin dashboard, so pointing at it is honest and rebuilding it
// would create a second Fans and Messages screen. `planned` has no screen at
// all, so the preview names the stage it belongs to and stops there. Neither
// case renders a control that looks like it works.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers3, MessageCircle, Receipt, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TONE } from "./CrmLabels";
import type { Tone } from "./CrmLabels";

export function SurfaceNote({
  label,
  availability,
  note,
  route,
}: {
  label: string;
  availability: "existing" | "planned";
  note?: string;
  route?: string;
}) {
  const planned = availability === "planned";
  return (
    <div className="dashboard-page space-y-5 pb-8" data-of-surface={planned ? "planned" : "existing"}>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{label}</h1>
          <span className="rounded-full bg-elev px-2 py-0.5 text-[11px] font-semibold text-muted">
            {planned ? "Planned" : "Existing"}
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          {planned
            ? "This has no screen yet and this build does not invent one. It is listed so the shape of the workspace is visible and so the stages stay honest."
            : "This surface already ships in the Twin dashboard. The channel links to it rather than rebuilding it, so there is only ever one Fans and Messages screen."}
        </p>
      </div>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{planned ? "Not in this preview" : "Where it lives today"}</CardTitle>
          <CardDescription>
            {planned ? "Tagged as Planned in the navigation." : "Linked, not reproduced here."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {note ? <p className="leading-6">{note}</p> : null}
          {route ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-[#fbfdfe] p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Route</span>
              <code className="rounded bg-elev px-2 py-1 font-mono text-xs text-ink">{route}</code>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

const OUTLINE: { title: string; body: string; tone: Tone; icon: LucideIcon }[] = [
  {
    title: "One attention queue",
    body: "Every conversation that needs a person, whatever channel it arrived on, ranked by what it costs to leave waiting.",
    tone: "gold",
    icon: MessageCircle,
  },
  {
    title: "Channel-aware money",
    body: "Telegram Stars and OnlyFans amounts keep their own units and currency. Nothing merges them into one figure.",
    tone: "green",
    icon: Receipt,
  },
  {
    title: "One creator identity",
    body: "A creator is selected once. Each channel then scopes its own accounts underneath that identity.",
    tone: "blue",
    icon: UsersRound,
  },
];

export function AllChannelsOutline() {
  return (
    <div className="dashboard-page space-y-5 pb-8" data-of-surface="combined-overview">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">All channels</h1>
          <span className="rounded-full bg-elev px-2 py-0.5 text-[11px] font-semibold text-muted">
            Planned
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          The combined view across Telegram and OnlyFans. It is the reason the channel switcher exists, and it is
          the one surface that cannot be built until both channel integrations are real.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {OUTLINE.map((item) => (
          <Card key={item.title} className="rounded-2xl">
            <CardHeader>
              <span className={`grid size-10 place-items-center rounded-xl ${TONE[item.tone]}`}>
                <item.icon className="size-5" />
              </span>
              <CardTitle className="mt-3">{item.title}</CardTitle>
              <CardDescription className="leading-6">{item.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-elev text-muted">
              <Layers3 className="size-4" />
            </span>
            <div>
              <CardTitle>Where this sits</CardTitle>
              <CardDescription>Nothing on this screen is built, and none of it is claimed.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted">
          <p>
            Telegram already has its own workspace. OnlyFans has accounts and an inbox. The combined surface needs
            the earnings contract from the consolidation plan before a total on it would mean anything.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
