import Link from "next/link";

export type CrmTeamMember = {
  agencyId: string;
  agencyName: string;
  email: string | null;
  userId: string;
  active: boolean;
  creatorAccessCount: number | null;
};

function AccessState({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex w-fit rounded-md border border-emerald-700/20 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
          : "inline-flex w-fit rounded-md border border-line bg-elev px-2 py-1 text-xs font-semibold text-muted"
      }
    >
      {active ? "Active" : "Revoked"}
    </span>
  );
}

function AvailabilityPanel({
  title,
  state,
  children,
}: {
  title: string;
  state: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
        <span className="rounded-md border border-line bg-elev px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {state}
        </span>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{children}</p>
    </section>
  );
}

export default function CrmTeamDirectory({
  members,
  scopeLabel,
  loadError,
  canAdministerAccess,
}: {
  members: CrmTeamMember[];
  scopeLabel: string;
  loadError?: string;
  canAdministerAccess: boolean;
}) {
  const activeCount = members.filter((member) => member.active).length;
  const agencyCount = new Set(members.map((member) => member.agencyId)).size;

  return (
    <div className="dashboard-page pb-10 text-ink">
      <header className="border-b border-line pb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">CRM / Team</div>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Team access</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Verified agency membership and creator access scope for {scopeLabel}. Roles, presence and performance are shown only when the underlying data exists.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/crm/settings?section=roles"
              className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-elev"
            >
              Permission settings
            </Link>
            {canAdministerAccess ? (
              <Link
                href="/agency-admin"
                className="inline-flex h-9 items-center justify-center rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Manage access
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4 text-sm">
        <div><span className="font-semibold tabular-nums text-ink">{activeCount}</span> <span className="text-muted">active memberships</span></div>
        <div><span className="font-semibold tabular-nums text-ink">{members.length}</span> <span className="text-muted">access records</span></div>
        <div><span className="font-semibold tabular-nums text-ink">{agencyCount}</span> <span className="text-muted">agencies represented</span></div>
      </div>

      {loadError ? (
        <div role="alert" className="mt-5 rounded-lg border border-amber-700/25 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {loadError}
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-lg border border-line bg-panel shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <h2 className="font-heading text-base font-semibold text-ink">Membership directory</h2>
          <p className="mt-1 text-sm text-muted">Each row is backed by an agency membership record. No job title or activity status is inferred.</p>
        </div>

        <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(120px,1fr)_88px_104px_96px] gap-3 border-b border-line bg-elev/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted xl:grid">
          <div>Member</div>
          <div>Agency</div>
          <div>Access</div>
          <div>Creator scope</div>
          <div>Role</div>
        </div>

        {members.length ? (
          <div className="divide-y divide-line">
            {members.map((member) => (
              <div
                key={`${member.agencyId}:${member.userId}`}
                className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(180px,1.4fr)_minmax(120px,1fr)_88px_104px_96px] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{member.email || "Email unavailable"}</div>
                  <div className="mt-1 text-xs text-muted">Verified membership record</div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted xl:hidden">Agency</div>
                  <div className="mt-1 truncate text-sm text-ink xl:mt-0">{member.agencyName}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted xl:hidden">Access</div>
                  <AccessState active={member.active} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted xl:hidden">Creator scope</div>
                  <div className="mt-1 text-sm text-ink xl:mt-0">
                    {member.creatorAccessCount == null
                      ? "Unavailable"
                      : `${member.creatorAccessCount} ${member.creatorAccessCount === 1 ? "creator" : "creators"}`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted xl:hidden">Role</div>
                  <div className="mt-1 text-sm text-muted xl:mt-0">Not recorded</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <div className="text-sm font-semibold text-ink">No membership records</div>
            <p className="mt-1 text-sm text-muted">There are no agency access records in this scope.</p>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <AvailabilityPanel title="Presence and shifts" state="Not configured">
          The current dashboard schema has no team presence, shift or coverage source. Online status and scheduled hours are therefore not displayed.
        </AvailabilityPanel>
        <AvailabilityPanel title="Sales attribution" state="Unavailable">
          Revenue reporting exists at creator and fan level, but there is no team-member attribution record. Sales totals cannot be assigned to individual members.
        </AvailabilityPanel>
      </div>
    </div>
  );
}
