// KNOWN RED (W1 lane 7b F1, REVIEW.md inv 7 Money: "no default that spends credits (e.g. missing mode → production)"; RISKS D11):
// Preparation.tsx:77 builds `qualification:{mode:config?.qualification.mode??"production",...}`. The form has no mode control, so the first
// save of a fresh account posts the credit-spending "production" mode nobody chose. Fixed = a first save either sends nothing until a
// mode is chosen, or sends a non-production mode. Team's Claude owns the fix.
// Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, global fetch stubbed, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { field, openPreparation, preparationConfigured, preparationRead, preparationUnconfigured, savePreparationLimits, stubFetch, submit, type } from "../helpers/w1-7b-dom";

const backend = (preparation: unknown) => stubFetch({ read: () => preparationRead(preparation),
  post: () => Response.json({ ok: false, outcome: "unconfirmed" }, { status: 502 }) });
const mode = (body: Record<string, unknown>) => (body.config as { qualification: { mode: string } } | undefined)?.qualification.mode;

test("control: a configured account resubmits with its own non-production mode unchanged", async () => {
  const stub = backend(preparationConfigured("fixture"));
  await openPreparation(stub);
  await savePreparationLimits();
  assert.equal(stub.posts.length, 1, "the resubmit is posted once");
  assert.equal(mode(stub.posts[0].body), "fixture");
});

test("F1: the first save of an unconfigured account never defaults to the credit-spending production mode", async () => {
  const stub = backend(preparationUnconfigured());
  await openPreparation(stub);
  await type(field("FansAPI account ID"), "acct_synthetic");
  await type(field("OnlyFans creator ID"), "123456");
  await type(field("Maximum provider requests"), "10");
  await type(field("Maximum provider credits"), "100");
  await type(field("Approved credits reserved per request"), "1");
  await type(field("Budget approval reference"), "synthetic-approval-1");
  await submit(document.querySelector("[data-commercial-preparation] form"));
  if (!stub.posts.length) {
    // Nothing posted counts only if the page asks for the mode (a control or notice naming it), not if the form silently broke.
    const asksForMode = [...document.querySelectorAll("[data-commercial-preparation] label, [data-commercial-preparation] select, [data-commercial-preparation] [role=status], [data-commercial-preparation] legend")]
      .some(element => /mode/i.test(`${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`));
    assert.ok(asksForMode, "nothing was posted, so the page must ask for a qualification mode");
    return;
  }
  const modes = stub.posts.map(post => mode(post.body));
  assert.ok(modes.every(mode => mode !== "production"), `first save posted qualification.mode ${JSON.stringify(modes)}; no mode was chosen, so it must not default to production`);
});
