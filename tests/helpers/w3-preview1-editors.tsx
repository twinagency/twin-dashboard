/** ConfigurationEditor + ContentEditor fixtures (W3 ui-onlyfans-preview-1). Shapes pass lib/onlyfans/configuration.ts and content-v2.ts parsers. */
import assert from "node:assert/strict";
import React from "react";
import { CONFIGURATION_SCHEMA, FACT_KEYS } from "../../lib/onlyfans/configuration";
import { CONTENT_V2_SCHEMA } from "../../lib/onlyfans/content-v2";
import { ACCOUNT, bodyOf, click, json, mount, posts, q, serve, submit, type, type Answer } from "./w3-preview1-dom";

export const ITEM = "101";
export const SAVED_PERSONA = "Saved persona text", TYPED_PERSONA = "Operator typed persona", SAVED_DESCRIPTION = "Saved description", TYPED_DESCRIPTION = "Operator typed description";

const configuration = {
  configurationRevision: 7, fingerprint: "f".repeat(64), persona: SAVED_PERSONA, personaTruncated: false,
  creatorFacts: Object.fromEntries(FACT_KEYS.map(key => [key, null])), factFields: FACT_KEYS.map(key => ({ key, label: key })),
  factsValid: true, readOnlyFacts: [], modelsValid: true, defaultModel: "model-a", replyModelOverride: null, replyOverridePresent: false,
  resolvedReplyModel: "model-a", modelOptions: ["model-a"], sharedFacts: { state: "unconfigured", checkedAt: null, sourceUpdatedAt: null, overrideKeys: [] },
  salesConfigurationValid: true, onRequestSalesEnabled: false, fasttDiscountResend: false, fasttPostBuyUpsell: false,
  dailyCostCapCents: 0, reasoningEffort: null, reasoningOptions: {},
};
/** Mounts ConfigurationEditor against a server that always reads the saved fixture; `write` answers each save POST. Types the persona. */
export async function configurationSave(write: Answer) {
  serve(call => call.method === "GET" ? json({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: ACCOUNT, configuration }) : write());
  const { default: ConfigurationEditor } = await import("../../components/onlyfans-preview/ConfigurationEditor");
  await mount(<ConfigurationEditor accountId={ACCOUNT} />, "/onlyfans/settings");
  const persona = q<HTMLTextAreaElement>("[data-of-edit-persona]");
  assert.equal(persona?.value, SAVED_PERSONA, "editor loaded the saved persona");
  await type(persona, TYPED_PERSONA);
  await submit(q("[data-of-save-configuration]")?.closest("form"));
  assert.equal(posts().length, 1, "one save sent");
  assert.deepEqual(bodyOf(posts()[0]).patch, { persona: TYPED_PERSONA });
}
export const configurationNotice = () => q("[data-of-configuration-notice]")?.textContent ?? "";

const item = { revision: 2, fingerprint: "e".repeat(64), label: "Beach set", labelTruncated: false, description: SAVED_DESCRIPTION, descriptionTruncated: false,
  priceCents: 1200, enabled: false, currency: "USD", isFreeTeaser: false, pricingMode: "dynamic", provenance: null, priceOverridden: false };
/** Mounts ContentEditor, opens it, types a description and saves; `write` answers each save POST. Sync-draft lookups find nothing. */
export async function contentSave(write: Answer) {
  serve(call => {
    if (call.url.includes("/sync/") || call.url.includes("/drafts")) return json({ ok: true, data: { items: [], nextCursor: null } });
    return call.method === "GET" ? json({ schemaVersion: CONTENT_V2_SCHEMA, ok: true, accountId: ACCOUNT, itemId: ITEM, item }) : write();
  });
  const { default: ContentEditor } = await import("../../components/onlyfans-preview/ContentEditor");
  await mount(<ContentEditor accountId={ACCOUNT} itemId={ITEM} />, "/onlyfans/content");
  await click(q("[data-of-edit-content-open]"));
  const description = q<HTMLTextAreaElement>("[data-of-edit-content-description]");
  assert.equal(description?.value, SAVED_DESCRIPTION, "editor loaded the saved item");
  await type(description, TYPED_DESCRIPTION);
  await submit(q("[data-of-save-content]")?.closest("form"));
  const saves = posts();
  assert.equal(saves.length, 1, "one save sent");
  assert.deepEqual(bodyOf(saves[0]).patch, { description: TYPED_DESCRIPTION });
}
export const contentNotice = () => q("[data-of-content-notice]")?.textContent ?? "";
