"use client";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isPartnerPreview } from "@/lib/agency-policy";
import { usesTwinAgencyRefresh } from "@/lib/twin-agency-refresh";
import TwinCreatorRoster from "./TwinCreatorRoster";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "@/components/NavigationLink";
import CreatorAvatar from "@/components/CreatorAvatar";
import { toggleClonePause } from "@/app/clones/actions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  cloneCohortEnrollmentLabel,
  cloneCohortIsEnabled,
  cloneCohortLabel,
  cloneMatchesCohort,
  type CloneCohort,
  type CloneCohortFilter,
} from "@/lib/clone-cohort";

export type CloneCard = {
  id: string;
  onboarding?: boolean;
  name: string;
  slug: string;
  status: string;
  active: boolean;
  cohort: CloneCohort;
  cohortEnrolledAt: string | null;
  color: string;
  photoUrl?: string;
  features: string[];
};

const COHORT_OPTIONS: { value: CloneCohortFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new-system-v3", label: "New System V3" },
  { value: "new-system-v2", label: "New System V2" },
  { value: "new-system-v1", label: "V1" },
  { value: "control", label: "Control" },
];

export default function ClonesGrid({ clones }: { clones: CloneCard[] }) {
  const {readOnly,isAgency,agencyName,audience}=useDashboardAccess();
  const pathname = usePathname();
  // Prospect preview login may not open creator config; cards go to Earnings.
  const preview = isAgency && isPartnerPreview(agencyName);
  const [query, setQuery] = useState("");
  const [cohortFilter, setCohortFilter] = useState<CloneCohortFilter>("all");
  const router = useRouter();
  const [, startTransition] = useTransition();

  const togglePause = (e: React.MouseEvent, c: CloneCard) => {
    e.preventDefault(); // don't navigate into the card
    e.stopPropagation();
    startTransition(async () => {
      await toggleClonePause(c.id, c.active);
      router.refresh();
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clones.filter((c) => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
      return matchesSearch && (c.onboarding ? cohortFilter === "all" : cloneMatchesCohort(c.cohort, cohortFilter));
    });
  }, [query, cohortFilter, clones]);

  if (usesTwinAgencyRefresh(audience, agencyName, pathname)) return <TwinCreatorRoster clones={clones} preview={preview} readOnly={readOnly} onTogglePause={togglePause} />;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search creators"
          placeholder="Search creators…"
          className="h-9 max-w-xs"
        />
        <div
          role="group"
          aria-label="Filter creators by system"
          className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-panel p-1"
        >
          {COHORT_OPTIONS.map((option) => {
            const selected = cohortFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setCohortFilter(option.value)}
                aria-pressed={selected}
                className={
                  "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
                  (selected ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-elev hover:text-ink")
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-12 text-center text-muted">
          {query.trim() ? `No creators match “${query}” in this cohort.` : "No creators in this cohort."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={preview ? "/revenue" : c.onboarding ? "/agency/creators" : `/clones/${c.id}`}
              className="compact-creator-card group rounded-[22px] border border-line bg-panel p-5 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-accent-2/60 hover:shadow-[0_24px_54px_rgb(6_23_47/0.1)]"
            >
              {/* Header: avatar (ringed in the clone color) + name + status + features */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full p-[2px]" style={{ backgroundColor: c.color }}>
                  <div className="rounded-full bg-panel p-[2px]">
                    <CreatorAvatar name={c.name} photoUrl={c.photoUrl} className="h-14 w-14" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="creator-name truncate text-lg font-semibold text-ink">{c.name}</span>
                    <button
                      type="button"
                      onClick={(e) => togglePause(e, c)}
                      disabled={readOnly || c.onboarding}
                      title={c.onboarding ? "Twin setup pending" : readOnly ? "Read only" : c.active ? "Click to pause this bot" : "Click to resume this bot"}
                      className="shrink-0"
                    >
                      <Badge
                        className={
                          "gap-1.5 px-2.5 py-1 transition hover:opacity-80 " +
                          (c.active ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
                        }
                      >
                        <span className={"h-2 w-2 rounded-full " + (c.active ? "bg-good" : "bg-muted")} />
                        {c.onboarding ? "Setup pending" : readOnly ? (c.active ? "active" : "paused") : c.active ? "active · pause" : "paused · resume"}
                      </Badge>
                    </button>
                  </div>
                  {!c.onboarding && <><div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      title={
                        c.cohort === "new-system-v3"
                          ? "New System V3 enabled for every fan"
                          : c.cohort === "new-system-v2"
                          ? "New System V2 enabled with a stable 50/50 fan-level split"
                          : c.cohort === "new-system-v1"
                            ? "Version 1 conversion system enabled"
                          : "Control group using the existing conversion system"
                      }
                      className={
                        "border font-semibold " +
                        (cloneCohortIsEnabled(c.cohort)
                          ? "border-accent-2/30 bg-accent-2/10 text-accent-2"
                          : "border-line bg-elev text-muted")
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={
                          "h-1.5 w-1.5 rounded-full " +
                          (cloneCohortIsEnabled(c.cohort) ? "bg-accent-2" : "bg-muted")
                        }
                      />
                      {cloneCohortLabel(c.cohort)}
                    </Badge>
                    {c.features.map((f) => (
                      <Badge key={f} variant="secondary" className="font-medium text-muted">
                        {f}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-muted">
                    {cloneCohortEnrollmentLabel(c.cohort, c.cohortEnrolledAt)}
                  </div></>}
                  {c.onboarding && <div className="mt-2 text-sm text-muted">View onboarding →</div>}
                </div>
              </div>

            </Link>
          ))}
        </div>
      )}
    </div>
  );
}


