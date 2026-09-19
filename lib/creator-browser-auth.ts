"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicAuthConfig } from "../deployment/flirt-public-auth.cjs";

let client: SupabaseClient | undefined;
export type CreatorPublicAuth = { ref: string; url: string; key: string } | null;

// Lazy: rendering a preview must never open a connection to Twin's accounts.
export function creatorBrowserAuth(settings: CreatorPublicAuth): SupabaseClient {
  if (typeof window === "undefined") throw new Error("Account recovery requires a browser.");
  const config = publicAuthConfig(settings ?? {});
  if (!client) {
    client = createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: config.storageKey },
    });
  }
  return client;
}
