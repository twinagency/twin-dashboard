// RULE G09 (W3 ui-onlyfans-preview-2 P20): MessageAssetPreview's load effect cleans up. Unmount aborts every request it issued and
// revokes every blob URL it created, so a conversation switch neither leaks a buffered video nor lets a late response paint.
// Offline: jsdom, fetch stubbed, URL.createObjectURL / revokeObjectURL stubbed, synthetic ids.
import { calls, click, close, dom, mount, never, resetDom, serve, unmount } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach, mock } from "node:test";
import MessageAssetPreview from "../../components/onlyfans-preview/MessageAssetPreview";

const ACCOUNT = "acct-media-1";
const props = { accountId: ACCOUNT, conversationId: `${ACCOUNT}:fan-9`, messageId: "msg-1", mediaId: "701", kind: "photo" };
const image = () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), { status: 200, headers: { "Content-Type": "image/png" } });
let created: string[], revoked: string[];

beforeEach(() => {
  created = []; revoked = [];
  mock.method(URL, "createObjectURL", () => { const url = `blob:fixture/${created.length + 1}`; created.push(url); return url; });
  mock.method(URL, "revokeObjectURL", (url: string) => { revoked.push(url); });
});
afterEach(async () => { mock.restoreAll(); await resetDom(); });
after(close);

test("control: the preview loads through the stubbed route and renders the object URL", async () => {
  serve(() => image());
  await mount(<MessageAssetPreview {...props} />);
  assert.match(calls[0]?.url ?? "", /\/message-media\/fan-9\/msg-1\/701\/preview$/);
  assert.equal(document.querySelector("[data-of-message-asset] img")?.getAttribute("src"), "blob:fixture/1");
  assert.deepEqual(created, ["blob:fixture/1"]);
});

// The reds assert outcomes only: a fix that stops using fetch or blobs passes vacuously (the control proves today's path does).
test("P20: unmount aborts every preview request it issued", async () => {
  serve(() => never());
  await mount(<MessageAssetPreview {...props} />);
  await unmount();
  const aborted = calls.map(call => call.signal?.aborted ?? "no signal");
  assert.ok(aborted.every(state => state === true), `preview requests left running after unmount: ${JSON.stringify(aborted)}`);
});

test("P20: unmount revokes every blob URL it created", async () => {
  serve(() => image());
  await mount(<MessageAssetPreview {...props} />);
  await unmount();
  assert.deepEqual([...revoked].sort(), [...created].sort(), "object URLs created for the preview are never revoked");
});

test("FL2: a photo URL handed to window.open is not revoked at unmount, only a minute later", async () => {
  serve(() => image());
  const opened: string[] = [];
  dom.window.open = ((url: string) => { opened.push(url); return null; }) as typeof dom.window.open;
  await mount(<MessageAssetPreview {...props} />);
  await click(document.querySelector('[aria-label="Expand attached photo"]'));
  assert.deepEqual(opened, ["blob:fixture/1"]);
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await unmount();
    assert.deepEqual(revoked, [], "the URL the new tab is loading was revoked at unmount");
    mock.timers.tick(60_000);
    assert.deepEqual(revoked, ["blob:fixture/1"], "the handed-out URL is revoked later");
  } finally { mock.timers.reset(); }
});
