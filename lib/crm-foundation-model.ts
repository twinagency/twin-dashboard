export type CrmFoundationUnavailableReason = "not_migrated" | "query_failed";

export type CrmConnectionDisplayStatus =
  | "connected"
  | "authentication_required"
  | "sync_issue"
  | "not_connected"
  | "unavailable";

export type CrmStatusTone = "positive" | "warning" | "critical" | "neutral";

export type CrmCapabilityView = {
  capability: string;
  label: string;
  state: "supported" | "unsupported" | "degraded" | "unknown";
  stateLabel: string;
  detail: string | null;
  checkedAt: string | null;
};

export type CrmConnectionView = {
  id: string;
  creatorId: string;
  provider: string;
  providerLabel: string;
  accountLabel: string | null;
  connectionStatus: string;
  syncStatus: string;
  displayStatus: CrmConnectionDisplayStatus;
  displayStatusLabel: string;
  statusTone: CrmStatusTone;
  lastVerifiedAt: string | null;
  lastSyncedAt: string | null;
  capabilities: CrmCapabilityView[];
};

export type CrmCreatorView = {
  id: string;
  displayName: string;
  status: string;
  statusLabel: string;
  accountLinked: boolean;
  agency: { id: string; name: string } | null;
  twin: { id: string; name: string; slug: string | null; status: string } | null;
  mappingStatus: "resolved" | "conflict" | "unbound" | "unknown";
  mappingStatusLabel: string;
  mappingWarning: string | null;
  connections: CrmConnectionView[];
  updatedAt: string | null;
};

export type CrmFoundationAvailable = {
  status: "available";
  creators: CrmCreatorView[];
  loadedAt: string;
};

export type CrmFoundationUnavailable = {
  status: "unavailable";
  reason: CrmFoundationUnavailableReason;
  message: string;
  creators: [];
};

export type CrmFoundationResult = CrmFoundationAvailable | CrmFoundationUnavailable;

export type CrmCreatorRow = {
  id: string;
  display_name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CrmCreatorBindingRow = {
  creator_id: string;
  creator_account_id: string | null;
  clone_id: string | null;
  agency_id: string | null;
  mapping_status: string | null;
  conflict_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CrmChannelConnectionRow = {
  id: string;
  creator_id: string;
  provider: string | null;
  handle: string | null;
  display_name: string | null;
  connection_status: string | null;
  sync_status: string | null;
  last_verified_at: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CrmConnectionCapabilityRow = {
  connection_id: string;
  capability: string | null;
  state: string | null;
  detail: string | null;
  checked_at: string | null;
};

export type CrmAgencyRow = { id: string; name: string | null };
export type CrmCloneRow = { id: string; name: string | null; slug: string | null; status: string | null };

export type CrmFoundationRows = {
  creators: CrmCreatorRow[];
  bindings: CrmCreatorBindingRow[];
  connections: CrmChannelConnectionRow[];
  capabilities: CrmConnectionCapabilityRow[];
  agencies: CrmAgencyRow[];
  clones: CrmCloneRow[];
};

const DISPLAY_STATUS: Record<CrmConnectionDisplayStatus, { label: string; tone: CrmStatusTone }> = {
  connected: { label: "Connected", tone: "positive" },
  authentication_required: { label: "Authentication required", tone: "warning" },
  sync_issue: { label: "Sync issue", tone: "critical" },
  not_connected: { label: "Not connected", tone: "neutral" },
  unavailable: { label: "Unavailable", tone: "neutral" },
};

const PROVIDER_LABELS: Record<string, string> = {
  telegram: "Telegram",
  onlyfans: "OnlyFans",
  fanvue: "Fanvue",
  fansly: "Fansly",
  mym: "MYM",
};

const CAPABILITY_LABELS: Record<string, string> = {
  messaging: "Messaging",
  media: "Media",
  fans: "Fans",
  revenue: "Revenue",
  analytics: "Analytics",
  automations: "Automations",
  subscriptions: "Subscriptions",
  tips: "Tips",
};

const cleanText = (value: unknown, fallback: string, maxLength = 180): string => {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
};

const cleanOptionalText = (value: unknown, maxLength = 180): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
};

const cleanDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value || Number.isNaN(Date.parse(value))) return null;
  return value;
};

const titleCase = (value: string): string =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export function providerLabel(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  return PROVIDER_LABELS[normalized] ?? titleCase(normalized || "unknown");
}

export function connectionDisplayStatus(
  connectionStatus: string | null | undefined,
  syncStatus: string | null | undefined,
): { status: CrmConnectionDisplayStatus; label: string; tone: CrmStatusTone } {
  const connection = (connectionStatus ?? "").trim().toLowerCase();
  const sync = (syncStatus ?? "").trim().toLowerCase();

  let status: CrmConnectionDisplayStatus;
  if (["error", "failed", "degraded"].includes(sync) || connection === "degraded") status = "sync_issue";
  else if (["auth_required", "authentication_required", "reauth_required"].includes(connection)) status = "authentication_required";
  else if (connection === "connected") status = "connected";
  else if (["disconnected", "not_connected"].includes(connection)) status = "not_connected";
  else status = "unavailable";

  return { status, ...DISPLAY_STATUS[status] };
}

const normalizeCapabilityState = (state: string | null): CrmCapabilityView["state"] => {
  const normalized = (state ?? "").toLowerCase();
  if (normalized === "supported" || normalized === "unsupported" || normalized === "degraded") return normalized;
  return "unknown";
};

const capabilityStateLabel = (state: CrmCapabilityView["state"]): string => {
  if (state === "supported") return "Available";
  if (state === "unsupported") return "Not supported";
  if (state === "degraded") return "Degraded";
  return "Unknown";
};

const normalizeMappingStatus = (status: string | null): CrmCreatorView["mappingStatus"] => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "resolved" || normalized === "conflict" || normalized === "unbound") return normalized;
  return "unknown";
};

const mappingStatusLabel = (status: CrmCreatorView["mappingStatus"]): string => {
  if (status === "resolved") return "Resolved";
  if (status === "conflict") return "Needs review";
  if (status === "unbound") return "Not assigned";
  return "Unverified";
};

export function buildCrmFoundationView(rows: CrmFoundationRows): CrmCreatorView[] {
  const bindingByCreator = new Map(rows.bindings.map((binding) => [binding.creator_id, binding]));
  const agencyById = new Map(rows.agencies.map((agency) => [agency.id, agency]));
  const cloneById = new Map(rows.clones.map((clone) => [clone.id, clone]));
  const capabilityByConnection = new Map<string, CrmCapabilityView[]>();

  for (const row of rows.capabilities) {
    if (!row.connection_id || !row.capability) continue;
    const capability = cleanText(row.capability, "unknown", 80).toLowerCase();
    const state = normalizeCapabilityState(row.state);
    const next: CrmCapabilityView = {
      capability,
      label: CAPABILITY_LABELS[capability] ?? titleCase(capability),
      state,
      stateLabel: capabilityStateLabel(state),
      detail: cleanOptionalText(row.detail, 240),
      checkedAt: cleanDate(row.checked_at),
    };
    const existing = capabilityByConnection.get(row.connection_id) ?? [];
    existing.push(next);
    capabilityByConnection.set(row.connection_id, existing);
  }

  const connectionsByCreator = new Map<string, CrmConnectionView[]>();
  for (const row of rows.connections) {
    if (!row.id || !row.creator_id) continue;
    const provider = cleanText(row.provider, "unknown", 80).toLowerCase();
    const display = connectionDisplayStatus(row.connection_status, row.sync_status);
    const connection: CrmConnectionView = {
      id: row.id,
      creatorId: row.creator_id,
      provider,
      providerLabel: providerLabel(provider),
      accountLabel: cleanOptionalText(row.display_name, 120) ?? cleanOptionalText(row.handle, 120),
      connectionStatus: cleanText(row.connection_status, "unknown", 80).toLowerCase(),
      syncStatus: cleanText(row.sync_status, "unknown", 80).toLowerCase(),
      displayStatus: display.status,
      displayStatusLabel: display.label,
      statusTone: display.tone,
      lastVerifiedAt: cleanDate(row.last_verified_at),
      lastSyncedAt: cleanDate(row.last_synced_at),
      capabilities: (capabilityByConnection.get(row.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    };
    const existing = connectionsByCreator.get(row.creator_id) ?? [];
    existing.push(connection);
    connectionsByCreator.set(row.creator_id, existing);
  }

  return rows.creators
    .filter((creator) => Boolean(creator.id))
    .map((creator): CrmCreatorView => {
      const binding = bindingByCreator.get(creator.id);
      const agency = binding?.agency_id ? agencyById.get(binding.agency_id) : null;
      const twin = binding?.clone_id ? cloneById.get(binding.clone_id) : null;
      const mappingStatus = normalizeMappingStatus(binding?.mapping_status ?? null);
      const mappingWarning =
        mappingStatus === "conflict"
          ? cleanOptionalText(binding?.conflict_reason, 240) ?? "This creator has an unresolved legacy mapping."
          : mappingStatus === "unbound"
            ? "This creator is not assigned to an agency or Twin."
            : null;

      return {
        id: creator.id,
        displayName: cleanText(creator.display_name, "Unnamed creator", 120),
        status: cleanText(creator.status, "unknown", 80).toLowerCase(),
        statusLabel: titleCase(cleanText(creator.status, "unknown", 80)),
        accountLinked: Boolean(binding?.creator_account_id),
        agency: agency ? { id: agency.id, name: cleanText(agency.name, "Unknown agency", 120) } : null,
        twin: twin
          ? {
              id: twin.id,
              name: cleanText(twin.name, "Unnamed Twin", 120),
              slug: cleanOptionalText(twin.slug, 120),
              status: cleanText(twin.status, "unknown", 80).toLowerCase(),
            }
          : null,
        mappingStatus,
        mappingStatusLabel: mappingStatusLabel(mappingStatus),
        mappingWarning,
        connections: (connectionsByCreator.get(creator.id) ?? []).sort((a, b) =>
          a.providerLabel.localeCompare(b.providerLabel),
        ),
        updatedAt: cleanDate(creator.updated_at),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function crmFoundationSummary(creators: CrmCreatorView[]) {
  const connections = creators.flatMap((creator) => creator.connections);
  return {
    creators: creators.length,
    connected: connections.filter((connection) => connection.displayStatus === "connected").length,
    attention: connections.filter((connection) =>
      ["authentication_required", "sync_issue"].includes(connection.displayStatus),
    ).length,
    mappingWarnings: creators.filter((creator) => creator.mappingStatus === "conflict").length,
    totalConnections: connections.length,
  };
}
