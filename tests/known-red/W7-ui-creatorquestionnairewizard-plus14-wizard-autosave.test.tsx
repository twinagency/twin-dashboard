// KNOWN RED (W7 ui-creatorquestionnairewizard-plus14, findings F1 + F2, high): the legacy (non-`quick-`) questionnaire
// wizard in components/CreatorQuestionnaireWizard.tsx loses answers around its autosave.
// F1: flushDraft clears dirtyRef before the fetch (:106) and beforeunload checks only dirtyRef (:190), so closing or
// reloading while "Saving..." is shown leaves without a prompt and aborts the request carrying the edits.
// F2: one wizard instance is reused across sections (no `key`), so revisionRef (:76) keeps the newest revision while a
// stale render (browser Back restoring the cached RSC) hands it the pre-edit initialAnswers; snapshot() (:93) re-posts
// every field with that newest revision, so the server's revision check passes and the saved edit is overwritten.
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, global fetch stubbed, real 1 s autosave timer.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
import type { CreatorProfileQuestionnaireProps } from "../../components/CreatorProfileQuestionnaire";
import { CREATOR_QUESTIONNAIRE_PAGES, questionnairePageQuestions } from "../../lib/creator-questionnaire-draft";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/creator/onboarding?step=questionnaire&section=personal-contact" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
  FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
let createRoot: typeof import("react-dom/client").createRoot;
let Wizard: (props: CreatorProfileQuestionnaireProps) => React.ReactElement;
let AppRouterContext: React.Context<unknown>;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime") as unknown as { AppRouterContext: React.Context<unknown> });
  ({ default: Wizard } = await import("../../components/CreatorQuestionnaireWizard") as unknown as { default: typeof Wizard });
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const wait = async (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

const PAGE_A = CREATOR_QUESTIONNAIRE_PAGES[0], PAGE_B = CREATOR_QUESTIONNAIRE_PAGES[1];
assert.equal(PAGE_A.slug, "personal-contact");
const [FIELD_X, FIELD_Y] = questionnairePageQuestions(PAGE_A).filter(question => question.type === "text").slice(2).map(question => question.id);
assert.deepEqual([FIELD_X, FIELD_Y], ["pronouns", "date_of_birth"], "two non-required text fields of page A");

const pushes: string[] = [];
const router = { push: (href: string) => { pushes.push(href); }, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} };
type Draft = { section: string; answers: Record<string, string>; revision: string };
const drafts: Draft[] = [];
function stubFetch(reply: (draft: Draft) => Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/creator-auth/onboarding/draft")) {
      const draft = JSON.parse(String(init.body)) as Draft;
      drafts.push(draft);
      return reply(draft);
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}
const tree = (props: CreatorProfileQuestionnaireProps) => <AppRouterContext.Provider value={router}><Wizard {...props} /></AppRouterContext.Provider>;
async function mount(props: CreatorProfileQuestionnaireProps) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(tree(props)); });
}
async function rerender(props: CreatorProfileQuestionnaireProps) { await act(async () => { root!.render(tree(props)); }); }
async function type(id: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`input[name="${id}"]`);
  assert.ok(field, `field ${id} rendered`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const unload = () => { const event = new dom.window.Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };

test("control: a typed answer autosaves once after the 1 s timer, and an unload before the timer fires is warned", async () => {
  drafts.length = 0;
  stubFetch(async () => Response.json({ revision: "r2" }));
  await mount({ page: PAGE_A, initialAnswers: {}, initialRevision: "r1" });
  assert.equal(document.querySelector("form")?.getAttribute("data-questionnaire-page"), "personal-contact", "legacy wizard rendered");
  await type(FIELD_X, "she/her");
  assert.equal(unload(), true, "dirty and the timer has not fired: unload must warn");
  assert.equal(drafts.length, 0, "nothing posted before the timer");
  await wait(1200);
  assert.equal(drafts.length, 1, "one autosave");
  assert.equal(drafts[0].section, "personal-contact");
  assert.equal(drafts[0].revision, "r1");
  assert.equal(drafts[0].answers[FIELD_X], "she/her");
  assert.match(document.body.textContent ?? "", /Saved/);
});

test("F1: unload during an in-flight autosave must warn", async () => {
  drafts.length = 0;
  let release!: (response: Response) => void;
  stubFetch(() => new Promise<Response>(resolve => { release = resolve; }));
  await mount({ page: PAGE_A, initialAnswers: {}, initialRevision: "r1" });
  await type(FIELD_X, "she/her");
  await wait(1200);
  assert.equal(drafts.length, 1, "the autosave request is in flight");
  assert.match(document.body.textContent ?? "", /Saving\.\.\./);
  const warned = unload();
  release(Response.json({ revision: "r2" }));
  await wait(25);
  assert.equal(warned, true, "unload during an in-flight autosave must warn");
});

test("F2: a stale re-render of an earlier section must not overwrite its saved answer with the newest revision", async () => {
  drafts.length = 0;
  let next = 2;
  stubFetch(async () => Response.json({ revision: `r${next++}` }));
  const stale = { [FIELD_X]: "old", [FIELD_Y]: "old" };
  await mount({ page: PAGE_A, initialAnswers: stale, initialRevision: "r1" });
  await type(FIELD_X, "new");
  await wait(1200);
  assert.equal(drafts.length, 1, "first edit saved");
  assert.deepEqual([drafts[0].revision, drafts[0].answers[FIELD_X]], ["r1", "new"]);
  // Same tree position, no key: section B, then browser Back hands section A the cached pre-edit props again.
  await rerender({ page: PAGE_B, initialAnswers: stale, initialRevision: "r1" });
  await rerender({ page: PAGE_A, initialAnswers: stale, initialRevision: "r1" });
  await type(FIELD_Y, "edited");
  await wait(1200);
  assert.equal(drafts.length, 2, "second edit autosaved");
  const second = drafts[1];
  assert.equal(second.answers[FIELD_Y], "edited");
  assert.notDeepEqual({ revision: second.revision, [FIELD_X]: second.answers[FIELD_X] }, { revision: "r2", [FIELD_X]: "old" },
    "a stale render must not post the untouched stale answer under the newest revision (server would accept and overwrite the saved edit)");
});
