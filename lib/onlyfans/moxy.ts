/** Moxy's additive configuration contract. Unknown shapes never imply readiness. */
export const MOXY_SCHEMA = "of-configuration.v3";
export type MoxyMode = "off" | "preview" | "on";
export type MoxyDecision = { id: string; fanId: number; kind: string; status: string; reason: string | null;
  decision: Record<string, unknown> | null; intentId: string | null };
export type MoxyCustom = { fanId: number; id: string; stage: string; owner: string; quoteCents: number | null;
  deadline: string | null; overdue: boolean; waitingOn: string };
export type MoxyView = { engine: "legacy"; moxySelected: false } | {
  engine: "moxy"; moxySelected: true; mode: MoxyMode; revision: number;
  readiness: { ready: boolean; blockers: string[] }; settings: Record<string, unknown>; decisions: MoxyDecision[];
  customs: MoxyCustom[];
};
/** Plain-English text for every reason/blocker code the backend emits. Unknown codes are shown raw by explainReason. */
export const REASON_TEXT: Record<string, string> = {
  account_binding_missing: "This account is not bound to a creator.",
  authorised_product_asset_mapping_missing: "No approved products are mapped to real media yet.",
  authorised_vault_sequence_missing: "No approved selling sequence has been supplied.",
  invalid_product_or_sequence_mapping: "The product or sequence mapping is invalid.",
  external_automation_coordination_unverified: "Other automation on this account has not been confirmed switched off.",
  handover_owner_missing: "No operator is assigned to take over handovers.",
  real_inventory_mapping_incomplete: "Some products are not matched to real vault media.",
  real_inventory_missing_or_stale: "Real vault media is missing or out of date.",
  production_verification_missing: "Production verification has not been recorded.",
  moxy_cutover_has_uncertain_delivery: "A message may still be in flight from the old system; resolve it first.",
  moxy_activation_not_ready: "Moxy cannot be turned On until readiness is clear.",
  talker_timing_unresolved: "The creator's reply timing rule is not defined, so no reply is timed.",
  creator_reply_gap_setting: "The creator reply gap setting is missing or invalid.",
  moxy_owner_lookup_failed: "Moxy ownership could not be checked; nothing was sent.",
  moxy_canonical_owner_required: "Moxy must be the single recorded owner of this account before it acts.",
  moxy_canonical_scheduler_required: "Moxy must be the only scheduler for this account.",
  moxy_owner_required: "Moxy has not been selected for this account.",
  moxy_owner_changed: "Account ownership changed while the work was in progress.",
  moxy_owned_handover: "A handover is owned by an operator; Moxy stays quiet.",
  owned_handover_required: "An owned handover is required first.",
  handover_must_not_reply: "A human has taken over this fan; Moxy will not reply.",
  moxy_off: "Moxy is Off for this account.",
  campaign_provider_recovery_required: "A campaign send hit a provider problem and needs recovery before continuing.",
  provider_authentication_required: "The provider login needs to be renewed.",
  provider_rate_limited: "The provider is rate limiting; will retry.",
  provider_rate_limit_retry: "Waiting to retry after a provider rate limit.",
  provider_retry_limit_reached: "Retries ran out; needs an operator.",
  moxy_campaign_changed: "The campaign changed after this was drafted.",
  moxy_campaign_product_changed: "The campaign product changed after this was drafted.",
  moxy_binding_changed: "The account binding changed after this was drafted.",
  moxy_snapshot_changed: "The conversation changed after this was drafted.",
  moxy_decision_not_current: "The draft is out of date.",
  moxy_decision_not_ready: "The draft is not ready to send.",
  moxy_writer_text_changed: "The draft text changed after approval.",
  stale_moxy_input: "The fan input is out of date.",
  stale: "Out of date.",
  sales_paused_by_current_input: "The fan's latest message pauses selling.",
  sales_state_held: "Selling is held for this fan.",
  no_push: "The fan asked not to be sold to.",
  safety_hold: "Held for safety review.",
  owner_or_safety_hold: "Held for an owner or safety review.",
  graveyard_clock_hold: "Held by the overnight shift rule.",
  graveyard_shift_unknown: "The overnight shift definition is not supplied.",
  commerce_needs_reconciliation: "A payment or delivery outcome is unknown and must be reconciled first.",
  exact_purchase_links_missing: "No exact purchase link for this item.",
  on_platform_payment_required: "Payment must happen on the platform.",
  custom_requires_owner: "A custom request needs a named owner.",
  custom_not_authorised: "Custom requests are not authorised for this creator.",
  open_custom_required: "No open custom request to act on.",
  custom_stage_out_of_order: "The custom request step is out of order.",
  invalid_custom_stage: "The custom request step is invalid.",
  invalid_custom_deadline: "The custom request deadline is invalid.",
  request_quote_required: "A quote is required for this custom request.",
  quote_below_creator_minimum: "The quote is below the creator's minimum.",
  paid_custom_cannot_be_declined: "A paid custom cannot be declined; it must be fulfilled.",
  fulfilment_evidence_required: "Evidence of fulfilment is required.",
  obligation_cannot_resolve_without_fulfilment: "An owed item cannot be closed without fulfilment.",
  owned_source_backed_obligation_required: "Obligations need an owner and a source reference.",
  verified_operator_state_required: "A verified operator and evidence are required.",
  verified_fan_source_required: "A verified fan source is required.",
  invalid_fan_control: "Invalid fan control value.",
  remedy_or_obligation_authority_missing: "No authority for this remedy or owed item.",
  remedy_requires_exact_approved_terms: "The remedy needs exactly the approved terms.",
  pilot_automation_deferred: "This automation is not enabled in the pilot.",
  pilot_specialist_handover_required: "Specialist services go to a human in the pilot.",
  outside_pilot_recipient_scope: "This fan is outside the pilot group.",
  product_mapping_missing: "The product is not mapped to media.",
  sequence_mapping_missing: "The sequence is not mapped.",
  product_terms_unresolved: "Product terms are not fully defined.",
  product_unavailable: "The product is unavailable.",
  unsupported_commercial_action: "That commercial action is not supported.",
  invitation_stale_or_ambiguous: "The earlier invitation is stale or unclear.",
  acceptance_product_mismatch: "The fan accepted a different product.",
  already_owned_use_existing_access: "The fan already owns this.",
  product_previously_rejected: "The fan already declined this product.",
  resend_not_requested: "The fan did not ask for a resend.",
  continuation_sequence_missing: "No sequence to continue from.",
  sequence_context_missing: "The sequence context is missing.",
  sequence_step_not_current: "That is not the next step in the sequence.",
  price_exceeds_budget: "The price is above the fan's stated budget.",
  price_below_authorised_minimum: "The price is below the approved minimum.",
  offer_already_pending: "An offer is already pending.",
  condition_unknown: "A required condition is unknown.",
  condition_not_met: "A required condition is not met.",
  question_requires_source_quote: "The buying question must be quoted from the fan.",
  current_request_evidence_missing: "No evidence for the fan's current request.",
  invalid_request_evidence: "The request evidence is invalid.",
  ownership_evidence_missing: "No evidence of what the fan owns.",
  creator_content_prohibited: "That content is prohibited for this creator.",
  untruthful_identity_or_instruction_leak: "The draft leaked instructions or misstated identity.",
  unsupported_output_markup_or_link: "The draft contained unsupported markup or a link.",
  unexpected_product_reference: "The draft named an unexpected product.",
  empty_model_reply: "The model returned nothing.",
  invalid_model_json: "The model reply was unreadable.",
  invalid_model_decision: "The model decision was invalid.",
  duplicate_model_key: "Duplicate model request.",
  moxy_model_unknown: "The model is not recognised.",
  moxy_model_usage_unknown: "Model cost is unknown, so it was stopped.",
  moxy_model_scope_mismatch: "The model is not approved for this account.",
  moxy_model_transport_mode_mismatch: "The model setup does not match the mode.",
  scoped_moxy_model_required: "An approved model must be set for this account.",
  moxy_context_budget_exceeded: "The conversation was too long to draft safely.",
  interrupted_moxy_generation: "Drafting was interrupted.",
  moxy_event_queued_for_authoritative_writer: "Queued for the single Moxy writer.",
  moxy_event_missing: "The event no longer exists.",
  moxy_event_key_conflict: "Duplicate event.",
  invalid_moxy_event: "The event is invalid.",
  invalid_moxy_batch: "The batch is invalid.",
  invalid_moxy_configuration: "The Moxy configuration is invalid.",
  moxy_revision_conflict: "Settings changed elsewhere; refresh and retry.",
  moxy_draft_refused: "The draft was refused.",
  permission_refused: "The creator's rules do not permit this.",
  instruction_missing: "A creator instruction is missing.",
};
const OPERATIONAL = "operational_field_missing:";
/** Explains a code; `code:detail` forms and unknown codes keep the raw code visible. Never returns an empty string. */
export function explainReason(code: string): string {
  if (code.startsWith(OPERATIONAL)) return `Creator setting not supplied: ${code.slice(OPERATIONAL.length)}`;
  const known = REASON_TEXT[code] ?? REASON_TEXT[code.split(":")[0]];
  return known ? known : code;
}
/** Blockers the operator cannot clear alone: Jesse must supply the creator setup input. */
const SUPPLY = new Set(["authorised_product_asset_mapping_missing", "authorised_vault_sequence_missing", "invalid_product_or_sequence_mapping",
  "real_inventory_mapping_incomplete", "real_inventory_missing_or_stale", "handover_owner_missing", "production_verification_missing",
  "external_automation_coordination_unverified", "talker_timing_unresolved", "creator_reply_gap_setting", "graveyard_shift_unknown"]);
export const needsSupply = (code: string) => code.startsWith(OPERATIONAL) || SUPPLY.has(code);
/** Customs stage names as the backend defines them (requested/confirmed/quoted/paid). */
export const CUSTOM_STAGE: Record<string, string> = { requested: "Requested", confirmed: "Confirmed", quoted: "Quoted", paid: "Paid", fulfilled: "Fulfilled" };
export const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const mode = (v: unknown): v is MoxyMode => v === "off" || v === "preview" || v === "on";
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function readiness(v: unknown): v is { ready: boolean; blockers: string[] } {
  return record(v) && typeof v.ready === "boolean" && Array.isArray(v.blockers) &&
    v.blockers.every(x => typeof x === "string") && (!v.ready || v.blockers.length === 0);
}
export function parseMoxy(value: unknown, accountId: string): MoxyView | null {
  if (!record(value) || value.ok !== true || value.schemaVersion !== MOXY_SCHEMA || value.accountId !== accountId || !record(value.moxy)) return null;
  const v = value.moxy;
  if (v.engine === "legacy" && v.moxySelected === false) return { engine: "legacy", moxySelected: false };
  if (v.engine !== "moxy" || v.moxySelected !== true || !mode(v.mode) || !revision(v.revision) ||
      !readiness(v.readiness) || !record(v.settings) || !Array.isArray(v.decisions) || v.decisions.length > 50) return null;
  if (!v.decisions.every(d => record(d) && typeof d.id === "string" && Number.isSafeInteger(d.fanId) && Number(d.fanId) > 0 &&
      typeof d.kind === "string" && typeof d.status === "string" && (d.reason === null || typeof d.reason === "string") &&
      (d.decision === null || record(d.decision)) && (d.intentId === null || typeof d.intentId === "string"))) return null;
  if (v.customs === undefined) v.customs = [];
  if (!Array.isArray(v.customs) || v.customs.length > 500 || !v.customs.every(c => record(c) && Number.isSafeInteger(c.fanId) &&
      typeof c.id === "string" && typeof c.stage === "string" && typeof c.owner === "string" && typeof c.waitingOn === "string" &&
      typeof c.overdue === "boolean" && (c.quoteCents === null || Number.isSafeInteger(c.quoteCents)) &&
      (c.deadline === null || typeof c.deadline === "string"))) return null;
  return v as MoxyView;
}
export type MoxyChange = { expectedRevision: number; mode: MoxyMode; settings: Record<string, unknown> };
export function validMoxyChange(v: unknown): v is MoxyChange {
  return record(v) && Object.keys(v).sort().join(",") === "expectedRevision,mode,settings" &&
    revision(v.expectedRevision) && mode(v.mode) && record(v.settings);
}
export function moxyAck(v: unknown, accountId: string, change: MoxyChange): boolean {
  return record(v) && v.ok === true && v.schemaVersion === MOXY_SCHEMA && v.accountId === accountId &&
    record(v.moxy) && v.moxy.mode === change.mode && v.moxy.revision === change.expectedRevision + 1 && readiness(v.moxy.readiness);
}
export function starterSettings(creator: string): Record<string, unknown> {
  return { creator_key: creator, products: [], sequences: {}, catalogue_bindings: {}, operational: {} };
}

