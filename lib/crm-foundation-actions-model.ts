export type CrmMutationErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_REVISION"
  | "CONFLICT"
  | "NOT_AVAILABLE"
  | "FAILED";

export type CrmMutationResult =
  | { ok: true }
  | { ok: false; error: { code: CrmMutationErrorCode; message: string } };

export type UpdateCrmCreatorInput = {
  creatorId: string;
  expectedRevision: number;
  displayName: string;
  status: "active" | "paused" | "archived";
};

export type SetCrmCreatorBindingInput = {
  creatorId: string;
  agencyId: string;
  expectedRevision: number;
  creatorAccountId: string | null;
  cloneId: string | null;
};

export type UpsertCrmChannelConnectionInput = {
  creatorId: string;
  provider: "telegram" | "onlyfans" | "fanvue" | "fansly" | "mym";
  expectedRevision: number;
  handle: string | null;
  displayName: string | null;
  connectionStatus: "unknown" | "auth_required" | "connected" | "degraded" | "disconnected" | "unavailable";
  syncStatus: "unknown" | "idle" | "syncing" | "current" | "error" | "unavailable";
  lastVerifiedAt: string | null;
  lastSyncedAt: string | null;
};

export type DisconnectCrmChannelConnectionInput = {
  creatorId: string;
  provider: UpsertCrmChannelConnectionInput["provider"];
  expectedRevision: number;
};

export type ResolveCrmMappingConflictInput = {
  conflictId: string;
  expectedRevision: number;
  bindingExpectedRevision: number;
  resolutionStatus: "resolved";
  agencyId: string;
  creatorAccountId: string | null;
  cloneId: string | null;
  resolutionNote: string;
};
