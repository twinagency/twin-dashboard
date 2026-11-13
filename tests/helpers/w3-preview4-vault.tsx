/**
 * W3 ui-onlyfans-preview-4 vault fixtures: wire bodies in the exact shape the dashboard routes answer, each accepted by the real parser
 * (lib/onlyfans/vault.ts, vault-editing.ts, vault-media.ts, commercial-categories.ts). Every test file asserts that acceptance as a control,
 * so a red can never come from a fixture the client silently rejects. Fingerprints/command keys are fixed 64-hex fixtures, not secrets.
 */
import { json, type Call } from "./w3-preview4-dom";

export const SCHEMA = "of-content.v1";
export const ACCOUNT = "of-a";
export const MEDIA = "101";
export const FOLDER = "7";
export const HASH = "a".repeat(64);
export const KEY = "b".repeat(64);
export const STAMP = "2026-11-12T08:00:00Z";
export const contentBase = `/api/onlyfans-content/accounts/${ACCOUNT}`;

export const vaultRow = (mediaId = MEDIA, kind = "photo") =>
  ({ mediaId, kind, durationSeconds: kind === "video" ? 12 : null, width: 1080, height: 1350, ready: true, reason: null, description: "Beach photo" });
export const vaultBody = (rows = [vaultRow()], connectionRevision: number | null = 3) => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT,
  vault: { items: rows, nextCursor: null, sync: null, connectionRevision,
    summary: { total: rows.length, photos: rows.filter(r => r.kind === "photo").length, videos: rows.filter(r => r.kind === "video").length, other: 0, matching: rows.length, folders: 1 } } });
export const foldersBody = () => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT, folders: [{ folderId: FOLDER, name: "Beach", count: 1 }] });
export const folderBody = (folderId = FOLDER) => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT, folder: { folderId, name: "Beach", count: 1, fingerprint: HASH, archived: false } });
export const assetBody = (description: string | null, tags: string[] | null = ["beach"]) =>
  ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT, asset: { mediaId: MEDIA, fingerprint: HASH, description, tags } });
export const editAck = (targetId: string) => ({ schemaVersion: SCHEMA, ok: true, applied: true, accountId: ACCOUNT, commandKey: KEY, targetId, fingerprint: HASH });
export const categoryPriceBody = (priceCents: number | null = 1000) => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT,
  categoryPrice: { folderId: FOLDER, name: "Beach", revision: 1, priceCents, currency: "USD", appliesTo: "single_asset", fingerprint: HASH } });
export const categoryReviewBody = (mediaId = MEDIA) => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: { [mediaId]: KEY } },
  categoryName: "Beach", assets: [{ mediaId, fingerprint: KEY, description: "One beach photo.", tags: null, kind: "photo", durationSeconds: null,
    analysisNote: null, classificationUncertain: false }] });
/** A route failure body exactly as lib/onlyfans/vault-route.ts / vault-backend.ts shape it. */
export const vaultFailure = (status: number, outcome: "refused" | "unconfirmed") =>
  json({ schemaVersion: SCHEMA, ok: false, outcome, error: "fixture" }, status);

export const uploadFile = (name = "beach.jpg", size = 3) => ({ fileId: "11111111-1111-4111-8111-111111111111", name, size, receivedBytes: 0, prefixDigest: null,
  status: "receiving", mediaId: null, processing: false, error: null });
export const uploadJob = (status: string, extra: Record<string, unknown> = {}) => ({ jobId: "22222222-2222-4222-8222-222222222222", kind: "upload", status,
  files: [uploadFile()], lastError: null, cleanupRequired: false, requestedAt: STAMP, updatedAt: STAMP, ...extra });
export const uploadsBody = (jobs: unknown[] = [], enabled = true) => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT,
  uploads: { schemaVersion: "of-vault-media.v1", accountId: ACCOUNT, maxFiles: 20, maxFileBytes: 1024 ** 3, chunkBytes: 8 * 1024 * 1024, enabled, jobs } });
export const uploadAck = (job: unknown) => ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT, upload: job });
export const videoBody = (status: string, ready: boolean, mediaId = MEDIA) =>
  ({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT, video: { mediaId, ready, status, bytes: ready ? 4096 : null, lastError: null } });

/** Answers every read a mounted VaultManager tree makes (vault page, folders, folder, category price, category review of MEDIA); other reads get a 404, which
 * every neighbour (Preparation, ContentSyncSave, uploads) treats as "not available here". Writes return undefined: the test answers them. */
export function vaultReads(call: Call): Response | undefined {
  if (call.method !== "GET") return undefined;
  const path = call.url.split("?")[0];
  if (path === `${contentBase}/vault`) return json(vaultBody());
  if (path === `${contentBase}/vault/manage/folders`) return json(foldersBody());
  if (path === `${contentBase}/vault/manage/folders/${FOLDER}`) return json(folderBody());
  if (path === `${contentBase}/vault/category-price/${FOLDER}`) return json(categoryPriceBody());
  if (path === `${contentBase}/vault/category-review/${FOLDER}` && new URL(call.url, "https://fixture.invalid").searchParams.get("mediaIds") === MEDIA) return json(categoryReviewBody());
  return json({ ok: false, error: "not in this fixture" }, 404);
}
