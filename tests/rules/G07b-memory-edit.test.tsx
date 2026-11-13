// RULE G07b memory-edit (regression guard, finding L9 data-risk; optimistic concurrency: a correction carries the version the
// operator was looking at when they started editing). Promoted from known-red W3-ui-onlyfans-launch-memory-edit. BMemoryPanel captures
// the memory version when a correction editor opens; if a refresh brings a newer version the editor closes, so a stale save is never
// sent against the refreshed version. Any re-read that closes it (Refresh, search, a correction's own re-read) says so, replacing a stale
// earlier notice; an unconfirmed outcome stays in front of it. L12 of the same known-red file is not G07b and stays there.
// Control "502 -> hold kept": an unconfirmed correction offers "Retry identical correction" after the re-read and sends no second PATCH.
// Mounts the real BMemoryPanel inside real Next router contexts. Offline: jsdom, stub fetch, synthetic ids (of-a, fan 42, hash-shaped
// memory versions of repeated digits).
//   node --import tsx --test tests/rules/G07b-memory-edit.test.tsx
import { button, click, html502, inNextApp, json, mount, stubFetch, submit, typeInto, unmount } from "../helpers/w3-launch-dom";
import { FAN, V1, V2, accounts, memoryDetail, memoryPage } from "../helpers/w3-launch-fixtures";
import { B_CONTRACT_SCHEMA } from "../../lib/onlyfans/launch/b-common";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const MEM = "/api/onlyfans-launch/memory/accounts/of-a";
async function open(patch?: () => Response, version: (n: number) => string = n => n === 0 ? V1 : V2) {
  const stub = stubFetch((url, method, n) => {
    if (url === "/api/onlyfans/accounts") return json(accounts("of-a"));
    if (url.startsWith(`${MEM}/fans?`)) return json(memoryPage());
    // First read of the fan: version V1. Every later read: V2 (someone else corrected memory meanwhile).
    if (url.startsWith(`${MEM}/fans/${FAN}`) && method === "GET") return json(memoryDetail(version(n)));
    if (url === `${MEM}/fans/${FAN}` && method === "PATCH") return patch ? patch() : json({ schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId: "of-a", fanId: FAN, correction: { revision: 3, replayed: false } });
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: BMemoryPanel } = await import("../../components/onlyfans-launch/memory/BMemoryPanel");
  await mount(inNextApp(React.createElement(BMemoryPanel, { canManage: true, initialAccountId: "of-a" }), "/onlyfans/launch/memory"));
  await click(document.querySelector(`[data-b-fan="${FAN}"]`));
  return stub;
}
const fanReads = (stub: ReturnType<typeof stubFetch>) => stub.calls.filter(c => c.method === "GET" && c.url.startsWith(`${MEM}/fans/${FAN}`)).map(c => c.url);
async function openEditor() {
  await click(button(/^Correct city$/));
  await typeInto(document.querySelector("#memory-value-home_city"), "Sydney");
  await typeInto(document.querySelector("#memory-reason-home_city"), "Fan corrected their city.");
}
const patchVersions = (stub: ReturnType<typeof stubFetch>) => stub.posts(/\/fans\/42$/, "PATCH").map(c => String(JSON.parse(String(c.raw)).expectedVersion));
const search = () => document.querySelector("#b-memory-query");
const editorOpen = () => Boolean(document.querySelector("#memory-value-home_city"));

test("control: correction saved without a refresh carries the version the editor opened on (V1)", async () => {
  const stub = await open();
  await openEditor();
  await click(button(/^Save value$/));
  assert.deepEqual(patchVersions(stub).map(v => v === V1), [true], "one PATCH at V1");
  await unmount();
});

test("L9: editor opened at V1, Refresh brings V2, Save sends V1 or the editor was closed", async () => {
  const stub = await open();
  await openEditor();
  await click(button(/^Refresh current state$/));
  assert.equal(fanReads(stub).length, 2, "refresh re-read the fan (now V2)");
  const stillOpen = editorOpen();
  if (stillOpen) await click(button(/^Save value$/));
  const versions = patchVersions(stub);
  assert.equal(stillOpen ? versions.length === 1 && versions[0] === V1 : versions.length === 0, true,
    `stale editor saved against the refreshed version (BMemoryPanel.tsx:108); open=${stillOpen} sentV1=${versions.map(v => v === V1).join(",")}`);
  await unmount();
});

test("L9: a refresh that brings a newer version and closes the editor says so", async () => {
  await open();
  await openEditor();
  await click(button(/^Refresh current state$/));
  const notice = document.querySelector("[data-b-notice]")?.textContent ?? "";
  assert.deepEqual({ editorOpen: editorOpen(), says: /changed/i.test(notice) && /reopen/i.test(notice) }, { editorOpen: false, says: true }, `notice: ${notice}`);
  await unmount();
});

const noticeText = () => document.querySelector("[data-b-notice]")?.textContent ?? "";
const saysClosed = (text: string) => /changed/i.test(text) && /reopen/i.test(text);
test("L9: a search re-read that brings a newer version closes the editor and says so", async () => {
  await open();
  await openEditor();
  await typeInto(search(), "zzz");
  await submit(search()?.closest("form"));
  assert.deepEqual({ editorOpen: editorOpen(), says: saysClosed(noticeText()) }, { editorOpen: false, says: true }, `notice: ${noticeText()}`);
  await unmount();
});

test("L9: a recorded correction's notice never survives a later version-change close of a new editor", async () => {
  const V3 = "3".repeat(64);
  await open(undefined, n => n === 0 ? V1 : n === 1 ? V2 : V3);
  await openEditor();
  await click(button(/^Save value$/));
  assert.equal(/recorded/i.test(noticeText()), true, "first correction recorded");
  await openEditor();
  await click(button(/^Refresh current state$/));
  const text = noticeText();
  assert.deepEqual({ editorOpen: editorOpen(), says: saysClosed(text), stale: /recorded/i.test(text) }, { editorOpen: false, says: true, stale: false }, `notice: ${text}`);
  await unmount();
});

test("L9: an unconfirmed correction whose re-read brings a newer version keeps the unconfirmed notice and says the editor closed", async () => {
  await open(html502);
  await openEditor();
  await click(button(/^Save value$/));
  const text = noticeText();
  assert.deepEqual({ editorOpen: editorOpen(), unconfirmed: /unconfirmed/i.test(text), says: saysClosed(text) }, { editorOpen: false, unconfirmed: true, says: true }, `notice: ${text}`);
  await unmount();
});

test("control: correction PATCH answers 502, one PATCH, the outcome is unconfirmed and the identical retry is offered", async () => {
  const stub = await open(html502);
  await openEditor();
  await click(button(/^Save value$/));
  assert.equal(fanReads(stub).length, 2, "the fan was re-read after the unconfirmed correction");
  assert.equal(patchVersions(stub).length, 1, "one PATCH, no automatic retry");
  const retry = button(/^Retry identical correction$/);
  assert.deepEqual({ retry: Boolean(retry && !retry.disabled), unconfirmed: /unconfirmed/i.test(document.body.textContent ?? "") }, { retry: true, unconfirmed: true });
  await unmount();
});

test("control: submitting the search sends query=zzz", async () => {
  const stub = await open();
  await typeInto(search(), "zzz");
  await submit(search()?.closest("form"));
  assert.equal(fanReads(stub).at(-1)?.includes("query=zzz"), true);
  await unmount();
});
