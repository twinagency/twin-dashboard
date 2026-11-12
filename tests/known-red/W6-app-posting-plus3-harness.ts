// Harness for the W6 app-posting-plus3 known-red tests (not a test itself).
// Loads the REAL app/sequences/actions.ts, transpiled with a fake require (precedent
// tests/known-red/W6-app-flows-step-id-remint.test.ts): guard / access / next/cache are no-ops, supabaseAdmin is a
// real @supabase/supabase-js client whose fetch is a fake at the wire (host .invalid, never touches the network).
// The pure lib modules (sequence-policy, sequence-render) are the real ones.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const nativeRequire = createRequire(import.meta.url);
export type Call = { method: string; table: string; url: URL; body: unknown };
export type Reply = { status: number; json?: unknown };
export type Router = (call: Call) => Reply;

export function loadSequenceActions(route: Router): { actions: Record<string, any>; wire: Call[] } {
  const wire: Call[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: String(init?.method ?? "GET").toUpperCase(),
      table: url.pathname.split("/").pop()!,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    wire.push(call);
    const reply = route(call);
    const accept = new Headers(init?.headers).get("accept") ?? "";
    let json = reply.json;
    if (accept.includes("vnd.pgrst.object") && Array.isArray(json)) json = json[0] ?? null;
    return new Response(json === undefined ? null : JSON.stringify(json), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const supabaseAdmin = createClient("https://offline.supabase.invalid", "offline-fixture", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakeFetch },
  });
  const path = "app/sequences/actions.ts";
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const actions: Record<string, any> = {};
  new Function("require", "exports", output)((name: string) => {
    if (name === "@/lib/agency-management") return { guardDashboardAction: async () => {} };
    if (name === "@/lib/dashboard-access") return { requireCloneAccess: async () => {} };
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "@/lib/supabase") return { supabaseAdmin };
    if (name === "@/lib/sequence-policy") return nativeRequire("../../lib/sequence-policy.ts");
    if (name === "@/lib/sequence-render") return nativeRequire("../../lib/sequence-render.ts");
    throw new Error("Unexpected action import: " + name);
  }, actions);
  return { actions, wire };
}

export const CLONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const REVISION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const FAN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
