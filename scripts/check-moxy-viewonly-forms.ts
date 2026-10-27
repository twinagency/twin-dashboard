import assert from "node:assert/strict";
const { JSDOM } = require("jsdom");
import { lockReadOnlyMutationForms } from "../components/DashboardAccessProvider";
async function main() {
  const dom = new JSDOM(`<body>
    <a id="nav" href="/onlyfans/accounts">Accounts</a>
    <button id="expand" aria-expanded="false">Settings</button>
    <form method="get"><input id="filter"><button id="search">Search</button></form>
    <form method="post" action="/agency/creator-invites/manage"><input id="edit"><button id="save">Create</button></form>
    <form method="post" action="/agency/logout"><button id="logout">Sign out</button></form>
    <form method="post" action="/agency/clone-scope"><select id="scope"><option>Creator</option></select></form>
  </body>`, {url:"https://dashboard.lynqai.co/agency/creator-invites"});
  const win = dom.window;
  Object.assign(globalThis, {document:win.document, MutationObserver:win.MutationObserver, HTMLFormElement:win.HTMLFormElement});
  const get = (id:string) => win.document.getElementById(id) as HTMLInputElement;
  const unlock = lockReadOnlyMutationForms(win.document.body);
  assert(get("edit").disabled && get("save").disabled, "mutation controls disabled");
  for (const id of ["nav","expand","filter","search","logout","scope"]) assert(!get(id).disabled, id);
  const form = get("save").closest("form")!;
  assert.equal(form.dispatchEvent(new win.Event("submit",{cancelable:true,bubbles:true})),false,"keyboard/script submit blocked");
  const later=win.document.createElement("button");form.append(later);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert(later.disabled,"late mounted action disabled");
  unlock();
  assert(!get("save").disabled && !get("edit").disabled,"full access restored on identity change");
  dom.window.close();
  console.log("PASS Moxy view-only forms: actions and keyboard submit blocked; navigation, filters, scope and logout retained");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
