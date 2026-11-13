// RULE G09 (W3 ui-onlyfans-preview-2 P20): MessageAssetPreview's load effect cleans up. Unmount aborts every request it issued and
// revokes every blob URL it created, so a conversation switch neither leaks a buffered video nor lets a late response paint.
// Offline: jsdom, fetch stubbed, URL.createObjectURL / revokeObjectURL stubbed, synthetic ids.
import { mount, stubFetch, unmount, never } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
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
afterEach(() => { mock.restoreAll(); });

test("control: the preview loads through the stubbed route and renders the object URL", async () => {
  const fetchStub = stubFetch(() => image());
  await mount(<MessageAssetPreview {...props} />);
  assert.match(fetchStub.calls[0]?.url ?? "", /\/message-media\/fan-9\/msg-1\/701\/preview$/);
  assert.equal(document.querySelector("[data-of-message-asset] img")?.getAttribute("src"), "blob:fixture/1");
  assert.deepEqual(created, ["blob:fixture/1"]);
});

// The reds assert outcomes only: a fix that stops using fetch or blobs passes vacuously (the control proves today's path does).
test("P20: unmount aborts every preview request it issued", async () => {
  const fetchStub = stubFetch(() => never());
  await mount(<MessageAssetPreview {...props} />);
  await unmount();
  const aborted = fetchStub.calls.map(call => call.signal?.aborted ?? "no signal");
  assert.ok(aborted.every(state => state === true), `preview requests left running after unmount: ${JSON.stringify(aborted)}`);
});

test("P20: unmount revokes every blob URL it created", async () => {
  stubFetch(() => image());
  await mount(<MessageAssetPreview {...props} />);
  await unmount();
  assert.deepEqual([...revoked].sort(), [...created].sort(), "object URLs created for the preview are never revoked");
});
