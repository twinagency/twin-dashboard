import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { parseMessageAttachments, attachmentPurchaseLabel } from "../lib/onlyfans/message-attachments";

async function main() {
  (globalThis as unknown as { React: typeof React }).React = React;
  const nativeRequire = createRequire(import.meta.url);
  nativeRequire.extensions[".css"] = module => { module.exports = {}; };
  const { default: MessageAttachments } = await import("../components/onlyfans-preview/MessageAttachments");
  const paid = { count: 5, media: [1,2,3,4,5].map(id => ({mediaId: String(id), kind: "photo" as const})), price: {currency:"USD",minorUnits:500}, purchaseStatus:"not_purchased" as const };
  assert.deepEqual(parseMessageAttachments(paid), paid);
  const markup = renderToStaticMarkup(<MessageAttachments accountId="of-176774528" attachments={paid} />);
  assert.match(markup, /Paid content/); assert.match(markup, /USD 5\.00/);
  assert.match(markup, /5 attachments/); assert.match(markup, /No purchase recorded/);
  assert.equal((markup.match(/data-of-vault-image=/g) || []).length, 5);
  assert.match(markup, /of-176774528/);
  assert.equal(renderToStaticMarkup(<MessageAttachments accountId="account" />), "");
  assert.match(renderToStaticMarkup(<MessageAttachments accountId="account" attachments={{...paid,purchaseStatus:"purchased"}} />), /Purchased/);
  assert.equal(attachmentPurchaseLabel("unconfirmed"), "Purchase status unavailable");
  const unavailable = renderToStaticMarkup(<MessageAttachments accountId="account" attachments={{...paid,media:[]}} />);
  assert.match(unavailable,/5 attachments/); assert.match(unavailable,/Some attachment previews are unavailable/);
  for (const invalid of [{...paid,count:-1},{...paid,count:0},{...paid,media:[{mediaId:"../other-account",kind:"photo"}]},{...paid,media:[paid.media[0],paid.media[0]]},{...paid,price:{currency:"USD",minorUnits:5.5}},{...paid,purchaseStatus:"paid"}]) assert.equal(parseMessageAttachments(invalid),null);
  const incoming={...paid,count:1,media:[{mediaId:"4761496022",kind:"photo" as const,source:"message" as const}]};
  assert.deepEqual(parseMessageAttachments(incoming),incoming);
  const messageMarkup=renderToStaticMarkup(<MessageAttachments accountId="of-99421145" conversationId="of-99421145:5459302" messageId="11790004102254" attachments={incoming}/>);
  assert.match(messageMarkup,/Loading preview/);assert.doesNotMatch(messageMarkup,/data-of-vault-image/);
  assert.equal(parseMessageAttachments({...incoming,media:[{...incoming.media[0],source:"foreign"}]}),null);
  console.log("PASS OnlyFans chat media: five previews, USD price, purchase meanings, legacy messages, missing previews and malformed metadata.");
}
main().catch(error => { console.error(error); process.exitCode=1; });

