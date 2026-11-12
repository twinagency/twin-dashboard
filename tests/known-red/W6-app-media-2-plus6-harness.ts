// Shared harness for the W6-app-media-2-plus6 known-red tests (not a test file itself).
// Loads the REAL app/media/actions.ts, transpiled with a fake require (precedent scripts/check-agency-clone-save.ts and
// tests/known-red/W6-app-flows-*). Real: pricing, media-analysis-row, media-classification, media-storage-path,
// reprice-confirmation, catalogue-core. Faked: the guard (no-op = internal admin), next/cache, vision (analysis fails),
// compression/prepare (identity), stored-preview (preview fails, path formula copied). The DB and Storage are faked at the
// wire: a real @supabase/supabase-js client whose `fetch` records every request and answers from a per-test handler.
// Offline: the host is .invalid and the fake fetch never touches the network.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import * as pricing from "../../lib/pricing";
import * as analysisRow from "../../lib/media-analysis-row";
import * as classification from "../../lib/media-classification";
import * as storagePathLib from "../../lib/media-storage-path";
import * as repriceConfirmation from "../../lib/reprice-confirmation";
import * as catalogueCore from "../../lib/catalogue-core";

const nativeRequire = createRequire(import.meta.url);
export const CLONE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const OTHER_CLONE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

export type WireCall = { method: string; path: string; query: URLSearchParams; body: unknown };
export type Reply = { status: number; body?: unknown };
type Handler = (call: WireCall) => Reply | undefined;

export const wire: WireCall[] = [];
let handler: Handler = () => undefined;
/** Reset the recorded wire and set how the fake DB/Storage answers. Unhandled requests answer 200 [] (REST) / {} (Storage). */
export function onWire(next: Handler): void {
  wire.length = 0;
  handler = next;
}

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const raw = init?.body;
  let body: unknown = null;
  if (typeof raw === "string") { try { body = JSON.parse(raw); } catch { body = raw; } }
  else if (raw != null) body = "<binary>";
  const call: WireCall = { method: String(init?.method ?? "GET").toUpperCase(), path: decodeURIComponent(url.pathname), query: url.searchParams, body };
  wire.push(call);
  const reply = handler(call) ?? { status: 200, body: call.path.startsWith("/storage/") ? {} : [] };
  const text = reply.body === undefined ? "" : JSON.stringify(reply.body);
  return new Response(reply.status === 204 ? null : text, { status: reply.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

export const supabaseAdmin = createClient("https://offline.supabase.invalid", "offline-fixture", {
  auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakeFetch },
});

const fakes: Record<string, unknown> = {
  "@/lib/vision-model": { configuredVisionModel: () => "offline/vision" },
  "@/lib/photo-vision-config": { withPhotoVisionColumn: <T>(run: (include: boolean) => T) => run(true) },
  "@/lib/agency-management": { guardDashboardAction: async () => {} },
  "next/cache": { revalidatePath() {} },
  "@/lib/supabase": { supabaseAdmin },
  "@/lib/caption": {
    analysePhoto: async () => { throw new Error("offline: no vision"); },
    analyseVideo: async () => { throw new Error("offline: no vision"); },
  },
  "@/lib/media-analysis-row": analysisRow,
  "@/lib/media-classification": classification,
  "@/lib/pricing": pricing,
  "@/lib/photo-prepare": { preparePhotoForTelegram: async (bytes: Buffer) => bytes },
  "@/lib/reprice-confirmation": repriceConfirmation,
  "@/lib/media-storage-path": storagePathLib,
  "@/lib/media-compress": {
    compressPhoto: async (bytes: Buffer) => ({ bytes, changed: false }),
    compressVideo: async (bytes: Buffer) => ({ bytes, changed: false }),
  },
  "@/lib/stored-preview": {
    makeBlurredPreview: async () => { throw new Error("offline: no preview"); },
    makeStoredVideoPreviewClip: async () => { throw new Error("offline: no preview"); },
    storedPreviewPath: (p: string) => `previews/${p}.jpg`,
    storedPreviewClipPath: (p: string) => `previews/${p}.mp4`,
  },
  "@/lib/catalogue-core": catalogueCore,
};

function load(path: string): Record<string, any> {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", output)((name: string) => {
    if (name in fakes) return fakes[name];
    if (name.startsWith("node:")) return nativeRequire(name);
    throw new Error("Unexpected action import: " + name);
  }, exports);
  return exports;
}

export const actions = load("app/media/actions.ts");

export const isRest = (call: WireCall, table: string, method: string) => call.path === `/rest/v1/${table}` && call.method === method;
export const isStorageRemove = (call: WireCall) => call.path === "/storage/v1/object/media" && call.method === "DELETE";
export const removedPaths = () => wire.filter(isStorageRemove).flatMap((call) => (call.body as { prefixes: string[] }).prefixes);
