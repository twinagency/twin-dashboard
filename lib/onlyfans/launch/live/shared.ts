/** Pure, client-safe pieces shared by the launch live modules. No server imports. */
export type Rec = Record<string, unknown>;
export const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
export const ID = /^[A-Za-z0-9._:-]{1,64}$/;
/** A numeric provider fan id. Never a conversation id, never an arbitrary path segment. */
export const FAN_ID = /^[1-9][0-9]{0,17}$/;

/** What the dashboard server needs from one request. `agency` is true for team (agency) members. */
export type Env = { fetch: typeof fetch; accountId: string; actor: string | null; canManage: boolean; agency: boolean };
export type Ans = { status: number; body: Rec };
export const SCHEMA = "of-launch-b.v1";
export const ok = (accountId: string, data: unknown, extra: Rec = {}): Ans => ({ status: 200, body: { schemaVersion: SCHEMA, ok: true, accountId, data, ...extra } });
export const fail = (status: number, error: string, code = "refused", extra: Rec = {}): Ans => ({ status, body: { schemaVersion: SCHEMA, ok: false, code, error, ...extra } });
export const READ_ONLY: Ans = fail(403, "Your team access is read-only.", "agency_read_only");
