import { randomUUID } from "node:crypto";
// Server-only by construction: this module depends on next/headers through
// getDashboardAccess and is exposed only through the validated Server Actions.
import { getDashboardAccess, type DashboardAccess } from "@/lib/dashboard-access";
import type {
  CrmMutationErrorCode,
  DisconnectCrmChannelConnectionInput,
  ResolveCrmMappingConflictInput,
  SetCrmCreatorBindingInput,
  UpdateCrmCreatorInput,
  UpsertCrmChannelConnectionInput,
} from "@/lib/crm-foundation-actions-model";
import { serviceClient } from "@/lib/supabase-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATOR_STATUSES = new Set(["active", "paused", "archived"]);
const PROVIDERS = new Set(["telegram", "onlyfans", "fanvue", "fansly", "mym"]);
const CONNECTION_STATUSES = new Set(["unknown", "auth_required", "connected", "degraded", "disconnected", "unavailable"]);
const SYNC_STATUSES = new Set(["unknown", "idle", "syncing", "current", "error", "unavailable"]);

type CrmWriteAccess = Exclude<DashboardAccess, null> & { kind?: "creator"; userId?: string };

type BindingScopeRow = {
  creator_id: string;
  creator_account_id: string | null;
  clone_id: string | null;
  agency_id: string | null;
  revision: number;
};

type ConnectionMutationRow = {
  creator_id: string;
  provider: string;
  provider_account_id: string | null;
  handle: string | null;
  display_name: string | null;
  connection_status: string;
  sync_status: string;
  last_verified_at: string | null;
  last_synced_at: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  revision: number;
};

export class CrmMutationError extends Error {
  constructor(
    public readonly code: CrmMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CrmMutationError";
  }
}

function invalid(message: string): never {
  throw new CrmMutationError("INVALID_INPUT", message);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Invalid CRM request.");
  return value as Record<string, unknown>;
}

function formOrRecord(value: unknown): Record<string, unknown> {
  if (value instanceof FormData) return Object.fromEntries(value.entries());
  return record(value);
}

function field(input: Record<string, unknown>, camel: string, snake: string): unknown {
  return input[camel] ?? input[snake];
}

function uuid(value: unknown, label: string, nullable = false): string | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "string" || !UUID.test(value)) invalid(`${label} is invalid.`);
  return value.toLowerCase();
}

function revision(value: unknown, allowZero = false): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) invalid("The record revision is invalid.");
  return parsed;
}

function text(value: unknown, label: string, max: number, nullable = false): string | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "string") invalid(`${label} is invalid.`);
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > max) invalid(`${label} is invalid.`);
  return cleaned;
}

function enumValue<T extends string>(value: unknown, values: Set<string>, label: string): T {
  if (typeof value !== "string" || !values.has(value)) invalid(`${label} is invalid.`);
  return value as T;
}

function timestamp(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) invalid(`${label} is invalid.`);
  return new Date(value).toISOString();
}

export function parseUpdateCrmCreatorInput(raw: unknown): UpdateCrmCreatorInput {
  const input = formOrRecord(raw);
  return {
    creatorId: uuid(field(input, "creatorId", "creator_id"), "Creator")!,
    expectedRevision: revision(field(input, "expectedRevision", "revision")),
    displayName: text(field(input, "displayName", "display_name"), "Display name", 200)!,
    status: enumValue(field(input, "status", "status"), CREATOR_STATUSES, "Creator status"),
  };
}

export function parseSetCrmCreatorBindingInput(raw: unknown): SetCrmCreatorBindingInput {
  const input = formOrRecord(raw);
  const creatorAccountId = uuid(field(input, "creatorAccountId", "creator_account_id"), "Creator account", true);
  const cloneId = uuid(field(input, "cloneId", "clone_id"), "Twin", true);
  if (!creatorAccountId && !cloneId) invalid("Select a creator account or Twin.");
  return {
    creatorId: uuid(field(input, "creatorId", "creator_id"), "Creator")!,
    agencyId: uuid(field(input, "agencyId", "agency_id"), "Agency")!,
    expectedRevision: revision(field(input, "expectedRevision", "revision")),
    creatorAccountId,
    cloneId,
  };
}

export function parseUpsertCrmChannelConnectionInput(raw: unknown): UpsertCrmChannelConnectionInput {
  const input = formOrRecord(raw);
  return {
    creatorId: uuid(field(input, "creatorId", "creator_id"), "Creator")!,
    provider: enumValue(field(input, "provider", "provider"), PROVIDERS, "Provider"),
    expectedRevision: revision(field(input, "expectedRevision", "revision") ?? 0, true),
    handle: text(field(input, "handle", "handle"), "Handle", 500, true),
    displayName: text(field(input, "displayName", "display_name"), "Connection name", 500, true),
    connectionStatus: enumValue(field(input, "connectionStatus", "connection_status"), CONNECTION_STATUSES, "Connection status"),
    syncStatus: enumValue(field(input, "syncStatus", "sync_status"), SYNC_STATUSES, "Sync status"),
    lastVerifiedAt: timestamp(field(input, "lastVerifiedAt", "last_verified_at"), "Last verified time"),
    lastSyncedAt: timestamp(field(input, "lastSyncedAt", "last_synced_at"), "Last synced time"),
  };
}

export function parseDisconnectCrmChannelConnectionInput(raw: unknown): DisconnectCrmChannelConnectionInput {
  const input = formOrRecord(raw);
  return {
    creatorId: uuid(field(input, "creatorId", "creator_id"), "Creator")!,
    provider: enumValue(field(input, "provider", "provider"), PROVIDERS, "Provider"),
    expectedRevision: revision(field(input, "expectedRevision", "revision")),
  };
}

export function parseResolveCrmMappingConflictInput(raw: unknown): ResolveCrmMappingConflictInput {
  const input = formOrRecord(raw);
  const resolutionStatus = enumValue<"resolved">(
    field(input, "resolutionStatus", "resolution_status"),
    new Set(["resolved"]),
    "Resolution",
  );
  const agencyId = uuid(field(input, "agencyId", "agency_id"), "Agency", true);
  const creatorAccountId = uuid(field(input, "creatorAccountId", "creator_account_id"), "Creator account", true);
  const cloneId = uuid(field(input, "cloneId", "clone_id"), "Twin", true);
  if (!agencyId || (!creatorAccountId && !cloneId)) {
    invalid("A resolved mapping needs an agency and at least one creator source.");
  }
  return {
    conflictId: uuid(field(input, "conflictId", "conflict_id"), "Conflict")!,
    expectedRevision: revision(field(input, "expectedRevision", "revision")),
    bindingExpectedRevision: revision(field(input, "bindingExpectedRevision", "binding_revision")),
    resolutionStatus,
    agencyId,
    creatorAccountId,
    cloneId,
    resolutionNote: text(field(input, "resolutionNote", "resolution_note"), "Resolution note", 1000)!,
  };
}

function writeAccess(access: DashboardAccess): { access: CrmWriteAccess | null; actorAuthUserId: string | null } {
  if (!access) return { access: null, actorAuthUserId: null };
  throw new CrmMutationError("FORBIDDEN", "CRM foundation changes require internal administrator access.");
}

async function bindingScope(creatorId: string, access: CrmWriteAccess | null): Promise<BindingScopeRow> {
  const result = await serviceClient()
    .from("crm_creator_bindings")
    .select("creator_id,creator_account_id,clone_id,agency_id,revision")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (result.error) throw databaseError(result.error, "Creator scope could not be verified.");
  if (!result.data) throw new CrmMutationError("NOT_FOUND", "Creator not found.");
  const row = result.data as BindingScopeRow;
  if (access) {
    if (row.agency_id !== access.id) throw new CrmMutationError("FORBIDDEN", "Creator access denied.");
    if (row.clone_id && !access.cloneIds.includes(row.clone_id)) throw new CrmMutationError("FORBIDDEN", "Creator access denied.");
  }
  return row;
}

async function validateBindingTargets(
  input: Pick<SetCrmCreatorBindingInput, "agencyId" | "creatorAccountId" | "cloneId">,
  access: CrmWriteAccess | null,
): Promise<void> {
  const agency = await serviceClient().from("partner_agencies").select("id").eq("id", input.agencyId).eq("active", true).maybeSingle();
  if (agency.error) throw databaseError(agency.error, "Agency assignment could not be verified.");
  if (!agency.data) throw new CrmMutationError("NOT_FOUND", "Agency not found.");
  if (input.cloneId) {
    if (access && !access.cloneIds.includes(input.cloneId)) throw new CrmMutationError("FORBIDDEN", "Twin access denied.");
    const clone = await serviceClient().from("clones").select("id").eq("id", input.cloneId).maybeSingle();
    if (clone.error) throw databaseError(clone.error, "Twin assignment could not be verified.");
    if (!clone.data) throw new CrmMutationError("NOT_FOUND", "Twin not found.");
    const agencyClone = await serviceClient()
      .from("agency_creators")
      .select("clone_id")
      .eq("agency_id", input.agencyId)
      .eq("clone_id", input.cloneId)
      .maybeSingle();
    if (agencyClone.error) throw databaseError(agencyClone.error, "Twin agency assignment could not be verified.");
    if (!agencyClone.data) throw new CrmMutationError("FORBIDDEN", "Twin does not belong to the selected agency.");
  }
  if (input.creatorAccountId) {
    const account = await serviceClient().from("creator_accounts").select("id").eq("id", input.creatorAccountId).maybeSingle();
    if (account.error) throw databaseError(account.error, "Creator account could not be verified.");
    if (!account.data) throw new CrmMutationError("NOT_FOUND", "Creator account not found.");
    const assignment = await serviceClient()
      .from("creator_agency_assignments")
      .select("agency_id")
      .eq("creator_account_id", input.creatorAccountId)
      .maybeSingle();
    if (assignment.error) throw databaseError(assignment.error, "Creator account scope could not be verified.");
    if (assignment.data?.agency_id !== input.agencyId) throw new CrmMutationError("FORBIDDEN", "Creator account does not belong to the selected agency.");
  }
  if (input.creatorAccountId && input.cloneId) {
    const relationship = await serviceClient()
      .from("creator_clone_links")
      .select("creator_account_id")
      .eq("creator_account_id", input.creatorAccountId)
      .eq("clone_id", input.cloneId)
      .maybeSingle();
    if (relationship.error) throw databaseError(relationship.error, "Creator and Twin relationship could not be verified.");
    if (!relationship.data) {
      throw new CrmMutationError("CONFLICT", "The selected creator account and Twin are not explicitly linked. Verify their identity relationship first.");
    }
  }
}

type SupabaseError = { code?: string; message?: string };

function databaseError(error: SupabaseError, fallback: string): CrmMutationError {
  if (error.code === "40001") return new CrmMutationError("STALE_REVISION", "This record changed since you opened it. Refresh and try again.");
  if (error.code === "42501") return new CrmMutationError("FORBIDDEN", "You do not have access to change this record.");
  if (error.code === "23503") return new CrmMutationError("NOT_FOUND", "A selected CRM record no longer exists.");
  if (error.code === "23505") return new CrmMutationError("CONFLICT", "That account is already linked to another creator.");
  if (error.code === "23514") return new CrmMutationError("CONFLICT", "The selected creator account, Twin and agency do not form a verified identity binding.");
  if (error.code === "P0002") return new CrmMutationError("NOT_FOUND", "The selected CRM record no longer exists.");
  if (error.code === "55000") return new CrmMutationError("CONFLICT", "This CRM record is no longer in a state that can be changed.");
  if (error.code === "22023") return new CrmMutationError("INVALID_INPUT", "The CRM change contains an invalid value.");
  if (["42883", "42P01", "PGRST202", "PGRST205"].includes(error.code ?? "")) {
    return new CrmMutationError("NOT_AVAILABLE", "CRM management is not available in this environment yet.");
  }
  return new CrmMutationError("FAILED", fallback);
}

async function rpc(name: string, args: Record<string, unknown>, fallback: string): Promise<void> {
  const result = await serviceClient().rpc(name, args);
  if (result.error) throw databaseError(result.error, fallback);
  if (!result.data || typeof result.data !== "object") throw new CrmMutationError("FAILED", fallback);
}

function correlationId(): string {
  return `dashboard:${randomUUID()}`;
}

export async function updateCrmCreator(raw: unknown): Promise<void> {
  const input = parseUpdateCrmCreatorInput(raw);
  const context = writeAccess(await getDashboardAccess());
  const binding = await bindingScope(input.creatorId, context.access);
  await rpc("crm_update_creator", {
    p_agency_id: binding.agency_id,
    p_creator_id: input.creatorId,
    p_expected_revision: input.expectedRevision,
    p_display_name: input.displayName,
    p_status: input.status,
    p_actor_auth_user_id: context.actorAuthUserId,
    p_correlation_id: correlationId(),
  }, "Creator could not be updated.");
}

export async function setCrmCreatorBinding(raw: unknown): Promise<void> {
  const input = parseSetCrmCreatorBindingInput(raw);
  const context = writeAccess(await getDashboardAccess());
  const binding = await bindingScope(input.creatorId, context.access);
  if (binding.agency_id && binding.agency_id !== input.agencyId) {
    throw new CrmMutationError("FORBIDDEN", "A creator cannot be reassigned to a different agency through this action.");
  }
  await validateBindingTargets(input, context.access);
  await rpc("crm_set_creator_binding", {
    p_agency_id: binding.agency_id ?? input.agencyId,
    p_creator_id: input.creatorId,
    p_expected_revision: input.expectedRevision,
    p_creator_account_id: input.creatorAccountId,
    p_clone_id: input.cloneId,
    p_actor_auth_user_id: context.actorAuthUserId,
    p_correlation_id: correlationId(),
  }, "Creator links could not be updated.");
}

export async function upsertCrmChannelConnection(raw: unknown): Promise<void> {
  const input = parseUpsertCrmChannelConnectionInput(raw);
  const context = writeAccess(await getDashboardAccess());
  const binding = await bindingScope(input.creatorId, context.access);
  const supplied = formOrRecord(raw);
  let current: ConnectionMutationRow | null = null;
  if (input.expectedRevision > 0) {
    const result = await serviceClient()
      .from("crm_channel_connections")
      .select("creator_id,provider,provider_account_id,handle,display_name,connection_status,sync_status,last_verified_at,last_synced_at,metadata,revision")
      .eq("creator_id", input.creatorId)
      .eq("provider", input.provider)
      .maybeSingle();
    if (result.error) throw databaseError(result.error, "Connection could not be verified.");
    if (!result.data) throw new CrmMutationError("NOT_FOUND", "Connection not found.");
    current = result.data as ConnectionMutationRow;
    if (current.revision !== input.expectedRevision) {
      throw new CrmMutationError("STALE_REVISION", "This record changed since you opened it. Refresh and try again.");
    }
  }
  const wasSupplied = (camel: string, snake: string): boolean => camel in supplied || snake in supplied;
  await rpc("crm_upsert_channel_connection", {
    p_agency_id: binding.agency_id,
    p_creator_id: input.creatorId,
    p_provider: input.provider,
    p_expected_revision: input.expectedRevision,
    p_provider_account_id: current?.provider_account_id ?? null,
    p_handle: wasSupplied("handle", "handle") ? input.handle : current?.handle ?? null,
    p_display_name: wasSupplied("displayName", "display_name") ? input.displayName : current?.display_name ?? null,
    p_connection_status: input.connectionStatus,
    p_sync_status: input.syncStatus,
    p_last_verified_at: wasSupplied("lastVerifiedAt", "last_verified_at") ? input.lastVerifiedAt : current?.last_verified_at ?? null,
    p_last_synced_at: wasSupplied("lastSyncedAt", "last_synced_at") ? input.lastSyncedAt : current?.last_synced_at ?? null,
    p_metadata: current?.metadata ?? {},
    p_actor_auth_user_id: context.actorAuthUserId,
    p_correlation_id: correlationId(),
  }, "Connection could not be saved.");
}

export async function disconnectCrmChannelConnection(raw: unknown): Promise<void> {
  const input = parseDisconnectCrmChannelConnectionInput(raw);
  const context = writeAccess(await getDashboardAccess());
  const binding = await bindingScope(input.creatorId, context.access);
  const current = await serviceClient()
    .from("crm_channel_connections")
    .select("creator_id,provider,provider_account_id,handle,display_name,connection_status,sync_status,last_verified_at,last_synced_at,metadata,revision")
    .eq("creator_id", input.creatorId)
    .eq("provider", input.provider)
    .maybeSingle();
  if (current.error) throw databaseError(current.error, "Connection could not be verified.");
  if (!current.data) throw new CrmMutationError("NOT_FOUND", "Connection not found.");
  const row = current.data as ConnectionMutationRow;
  if (row.revision !== input.expectedRevision) throw new CrmMutationError("STALE_REVISION", "This record changed since you opened it. Refresh and try again.");
  await rpc("crm_upsert_channel_connection", {
    p_agency_id: binding.agency_id,
    p_creator_id: input.creatorId,
    p_provider: input.provider,
    p_expected_revision: input.expectedRevision,
    p_provider_account_id: row.provider_account_id,
    p_handle: row.handle,
    p_display_name: row.display_name,
    p_connection_status: "disconnected",
    p_sync_status: "idle",
    p_last_verified_at: new Date().toISOString(),
    p_last_synced_at: row.last_synced_at,
    p_metadata: row.metadata ?? {},
    p_actor_auth_user_id: context.actorAuthUserId,
    p_correlation_id: correlationId(),
  }, "Connection could not be disconnected.");
}

export async function resolveCrmMappingConflict(raw: unknown): Promise<void> {
  const input = parseResolveCrmMappingConflictInput(raw);
  const access = await getDashboardAccess();
  if (access) throw new CrmMutationError("FORBIDDEN", "Mapping conflicts can only be resolved by an internal administrator.");
  await validateBindingTargets(input, null);
  await rpc("crm_resolve_creator_mapping_conflict", {
    p_conflict_id: input.conflictId,
    p_expected_revision: input.expectedRevision,
    p_expected_binding_revision: input.bindingExpectedRevision,
    p_resolution_status: input.resolutionStatus,
    p_agency_id: input.agencyId,
    p_creator_account_id: input.creatorAccountId,
    p_clone_id: input.cloneId,
    p_resolution_note: input.resolutionNote,
    p_actor_auth_user_id: null,
    p_correlation_id: correlationId(),
  }, "Mapping conflict could not be resolved.");
}
