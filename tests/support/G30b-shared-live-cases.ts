// G30b R1: which shared_media_transfers receipts are LIVE (block a new receipt for the same account+file) and which are
// retryable history. A hand-written literal table, deliberately NOT derived from lib/shared-media.ts: the route's PostgREST
// filter (G30b-shared-media-retry-route.test.ts) and the migration's partial unique index against real PostgreSQL
// (G30b-shared-media-retry-index.test.mjs) are both checked against it.
// Retryable only where the stored row proves the provider never received the file: the backend's recover() writes
// expired/media_request_expired and superseded/media_connection_changed only for a job still receiving or pending.
// [status, error_code, media_id, live]
export const SHARED_LIVE_CASES: ReadonlyArray<readonly [status: string, errorCode: string | null, mediaId: string | null, live: boolean]> = [
  ["expired", "media_request_expired", null, false],
  ["superseded", "media_connection_changed", null, false],
  ["expired", "media_request_expired", "777", true], // a vault media id is never retried
  ["superseded", "media_connection_changed", "777", true],
  ["expired", null, null, true], // operator cancel: the row alone proves nothing
  ["superseded", "media_binding_changed", null, true], // binding change can hit a running job
  ["interrupted", "worker_interrupted_review_required", null, true],
  ["failed", "provider_review_required", null, true], // worker failure or complete-with-anomaly
  ["failed", "provider_cleanup_required", null, true],
  ["failed", null, null, true],
  ["failed", "media_request_expired", null, true], // the pair, not either half
  ["expired", "media_connection_changed", null, true],
  ["superseded", "media_request_expired", null, true],
  ["expired", "some_new_code", null, true], // unknown code
  ["complete", null, "777", true],
  ["complete", "provider_review_required", null, true],
  ["prepared", null, null, true],
  ["receiving", null, null, true],
  ["pending", null, null, true],
  ["running", null, null, true],
];
