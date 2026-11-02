// Shared by the server (route.ts logs it as-is from validated initData) and the
// client (Catalogue.tsx opens the matching item/bundle detail modal on load).
// No node built-ins here on purpose: this file is imported from the client
// component, so it must be safe to bundle into the browser.

export type StartParamItem = { type: "photo" | "video" | "bundle"; id: string };

const PATTERN =
  /^item_(photo|video|bundle)_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

// Unknown/junk params return null; callers fall back to a normal load.
export function parseCatalogueStartParam(value: unknown): StartParamItem | null {
  if (typeof value !== "string") return null;
  const match = PATTERN.exec(value.trim());
  if (!match) return null;
  return { type: match[1] as StartParamItem["type"], id: match[2].toLowerCase() };
}
