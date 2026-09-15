import Link from "next/link";

export const CRM_SETTINGS_SECTIONS = [
  "connections",
  "profile",
  "roles",
  "sales",
  "time",
  "messaging",
  "security",
] as const;

export type CrmSettingsSection = (typeof CRM_SETTINGS_SECTIONS)[number];

const SECTION_LABELS: Record<CrmSettingsSection, string> = {
  connections: "Connections",
  profile: "Agency/Profile",
  roles: "Roles & permissions",
  sales: "Sales",
  time: "Time tracking",
  messaging: "Messaging",
  security: "Security",
};

function RouteRow({
  title,
  detail,
  href,
  action = "Open",
}: {
  title: string;
  detail: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted">{detail}</p>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex h-8 shrink-0 items-center justify-center self-start rounded-md border border-line bg-panel px-3 text-xs font-semibold text-ink transition hover:border-slate-400 hover:bg-elev sm:self-auto"
        >
          {action}
        </Link>
      ) : (
        <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-line bg-elev px-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
          Unavailable
        </span>
      )}
    </div>
  );
}

function SettingsPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <header className="border-b border-line px-4 py-5 sm:px-5">
        <h2 className="font-heading text-xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{detail}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}

function ActiveSettingsPanel({
  section,
  isAgency,
  canManage,
  agencyName,
}: {
  section: CrmSettingsSection;
  isAgency: boolean;
  canManage: boolean;
  agencyName?: string;
}) {
  if (section === "connections") {
    return (
      <SettingsPanel title="Connections" detail="Open the live account and integration surfaces already used by the dashboard.">
        <RouteRow title="Telegram Business" detail="Review the connected Telegram Business profile and its currently granted permissions for the selected creator." href="/business" action="Open business account" />
        {!isAgency ? <RouteRow title="Dashboard API access" detail="Issue and review read-only dashboard API credentials." href="/api-access" action="Open API access" /> : null}
      </SettingsPanel>
    );
  }

  if (section === "profile") {
    return (
      <SettingsPanel title="Agency/Profile" detail="Identity and creator records remain in their existing authoritative management surfaces.">
        <RouteRow
          title={agencyName || "Agency access"}
          detail={isAgency ? "Review the creator accounts currently assigned to this agency." : "Manage active partner agencies and their sign-in access."}
          href={isAgency ? "/agency/creators" : "/agency-admin"}
          action={isAgency ? "View assigned creators" : "Manage agencies"}
        />
        <RouteRow title="Creator profiles" detail="Open the creator directory to review or update individual creator configuration." href="/clones" action="Open creators" />
        <RouteRow title="Agency profile fields" detail="No editable agency-profile record or update workflow is configured in the current schema." />
      </SettingsPanel>
    );
  }

  if (section === "roles") {
    return (
      <SettingsPanel title="Roles & permissions" detail="Access is currently enforced through verified membership and server-side creator scope.">
        <RouteRow title="Membership directory" detail="Review the real agency membership records and the creator scope attached to each agency." href="/crm/team" action="Open team access" />
        {!isAgency ? <RouteRow title="Access provisioning" detail="Create or revoke a partner login through the existing protected administration route." href="/agency-admin" action="Manage access" /> : null}
        <RouteRow title="Granular team roles" detail="The membership schema does not currently store job titles or per-feature team roles, so no role controls are presented here." />
      </SettingsPanel>
    );
  }

  if (section === "sales") {
    return (
      <SettingsPanel title="Sales" detail="Use the live earnings ledger for verified revenue; team-member sales attribution is not configured.">
        <RouteRow title="Earnings and revenue" detail="View the dashboard’s existing creator and fan-level revenue reporting." href="/crm/analytics" action="Open analytics" />
        <RouteRow title="Team sales attribution" detail="No schema links a payment or purchase to a team member. Individual sales targets and commissions are therefore unavailable." />
      </SettingsPanel>
    );
  }

  if (section === "time") {
    return (
      <SettingsPanel title="Time tracking" detail="Time and attendance are not part of the current operating data model.">
        <RouteRow title="Shifts and coverage" detail="No shift schedule, clock-in event, presence signal or time-zone coverage table is configured." />
        <RouteRow title="Timesheets" detail="Timesheet and approval workflows are not available yet." />
      </SettingsPanel>
    );
  }

  if (section === "messaging") {
    return (
      <SettingsPanel title="Messaging" detail="Open the live conversation and campaign tools without duplicating their controls in settings.">
        <RouteRow title="Fan conversations" detail="Review conversations and manage manual takeover in the existing fan workspace." href="/crm/inbox" action="Open conversations" />
        <RouteRow title="Campaign flows" detail="Build and manage the message sequences already connected to the selected creator." href="/crm/automations" action="Open automations" />
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel title="Security" detail="Security-sensitive controls stay in the existing protected administration surfaces.">
      {!isAgency ? <RouteRow title="Agency access" detail="Create or revoke authenticated partner access." href="/agency-admin" action="Manage access" /> : null}
      {!isAgency ? <RouteRow title="Service credentials" detail="Review the administrator-only service key configuration." href="/settings#api-keys" action="Open credentials" /> : null}
      <RouteRow title="Operational logs" detail="Review the existing dashboard logs for the current authorized scope." href="/logs" action="Open logs" />
      {isAgency && !canManage ? <RouteRow title="Permission changes" detail="This agency session is read-only. Permission changes must be completed by a Twin administrator." /> : null}
    </SettingsPanel>
  );
}

export default function CrmSettingsShell({
  activeSection,
  agencyName,
  isAgency,
  canManage,
}: {
  activeSection: CrmSettingsSection;
  agencyName?: string;
  isAgency: boolean;
  canManage: boolean;
}) {
  return (
    <div className="dashboard-page pb-10 text-ink">
      <header className="border-b border-line pb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">CRM / Settings</div>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Routes, permissions and operating defaults for {agencyName || "the internal workspace"}. Existing systems remain the source of truth.
        </p>
      </header>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <nav aria-label="CRM settings sections" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel p-1 sm:grid-cols-3 lg:grid-cols-1">
            {CRM_SETTINGS_SECTIONS.map((section) => {
              const active = section === activeSection;
              return (
                <Link
                  key={section}
                  href={`/crm/settings?section=${section}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-md border border-slate-300 bg-elev px-3 py-2.5 text-sm font-semibold text-ink shadow-[0_1px_1px_rgb(15_23_42/0.04)]"
                      : "rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-muted transition hover:border-line hover:bg-elev hover:text-ink"
                  }
                >
                  {SECTION_LABELS[section]}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <ActiveSettingsPanel section={activeSection} isAgency={isAgency} canManage={canManage} agencyName={agencyName} />
        </main>
      </div>
    </div>
  );
}
