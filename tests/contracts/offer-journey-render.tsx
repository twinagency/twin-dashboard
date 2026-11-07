import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EngineStatus } from "../../components/onlyfans-preview/EngineStatus";

const path = process.env.ENGINE_OFFER_ARTIFACT;
assert(path, "A synthetic paid-journey artifact is required");
const views = JSON.parse(readFileSync(path, "utf8"));
(globalThis as unknown as { React: typeof React }).React = React;
const render = (value: unknown) => renderToStaticMarkup(<EngineStatus value={value} accountId="acc-a" conversationId="acc-a:101" />);
const offer = render(views.offer), purchase = render(views.purchase), access = render(views.access), revoked = render(views.revoked);
assert.match(offer, /Offer sent; purchase is not confirmed/);
assert.doesNotMatch(offer, /Purchase recorded|Purchase and access confirmed/);
assert.match(purchase, /Purchase recorded; access is not yet confirmed/);
assert.doesNotMatch(purchase, /Purchase and access confirmed/);
assert.match(access, /Purchase and access confirmed/);
assert.match(revoked, /Access revoked; review required/);
console.log("PASS synthetic offer, purchase, access and revocation are rendered as distinct states");
