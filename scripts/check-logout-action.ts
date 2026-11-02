import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {revokeOwnerSession} from "../lib/owner-auth";
import * as session from "../lib/session";
async function main(){
  process.env.SUPABASE_URL="https://logout.invalid";
  process.env.SUPABASE_SERVICE_KEY="synthetic";
  const token="owner_"+"a".repeat(64);
  let cookie:string|undefined=token, unavailable=false, guarded=false;
  const events:string[]=[];
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    events.push("revoke");
    assert(String(url).endsWith("/dashboard_owner_session_revoke"));
    assert(!String(init?.body).includes(token),"raw token must not leave server");
    if(unavailable)throw Error("private network payload");
    return Response.json(true);
  };
  const dependencies:Record<string,unknown>={
    "@/lib/agency-management":{guardDashboardAction:async()=>{events.push("guard");if(guarded)throw Error("agency denied");}},
    "next/headers":{cookies:async()=>({get:()=>cookie?{value:cookie}:undefined,delete:()=>{events.push("delete");cookie=undefined;}})},
    "next/navigation":{redirect:(path:string)=>{events.push("redirect");throw Error("redirect:"+path);}},
    "@/lib/session":session,"@/lib/owner-auth":{revokeOwnerSession},
  };
  const compiled=ts.transpileModule(readFileSync("app/login/actions.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={};
  vm.runInNewContext("(function(require,exports){"+compiled+"\n})",{})((name:string)=>{
    assert(name in dependencies,"unexpected import "+name);return dependencies[name];
  },exports);
  try{
    await assert.rejects(exports.logout(),/redirect:\/login/);
    assert.deepEqual(events,["guard","revoke","delete","redirect"]);
    events.length=0;
    await assert.rejects(exports.logout(),/redirect:\/login/);
    assert.deepEqual(events,["guard","delete","redirect"],"repeated logout must not require a live token");
    cookie=token;events.length=0;unavailable=true;
    await assert.rejects(exports.logout(),/could not revoke/);
    assert.equal(cookie,token);assert.deepEqual(events,["guard","revoke"]);
    unavailable=false;guarded=true;events.length=0;
    await assert.rejects(exports.logout(),/agency denied/);
    assert.equal(cookie,token);assert.deepEqual(events,["guard"]);
    console.log("Logout action PASS: revoke before clearing cookie, repeat sign-out, visible revocation failure, cookie retained on outage and existing agency guard.");
  }finally{globalThis.fetch=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
