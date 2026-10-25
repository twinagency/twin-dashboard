import assert from "node:assert/strict";
import { isFlirtOnlyFansOwner } from "../lib/onlyfans/flirt-owner";
import { identity } from "../deployment/flirt-live-twin.cjs";
import { agencyOnlyFansRequest } from "../lib/onlyfans/agency-scope";
const on = { FLIRT_SHARED_ONLYFANS_ENABLED: "true" };
assert.equal(isFlirtOnlyFansOwner(identity(), true, on), true);
assert.equal(isFlirtOnlyFansOwner(identity(), false, on), false);
assert.equal(isFlirtOnlyFansOwner(null, true, on), false);
assert.equal(isFlirtOnlyFansOwner({name:"FLIRT"}, true, on), false);
assert.equal(isFlirtOnlyFansOwner({...identity(),id:"different"}, true, on), false);
assert.equal(isFlirtOnlyFansOwner(identity(), true, {}), false);
assert.equal(isFlirtOnlyFansOwner({...identity(),cloneIds:[]}, true, on), false);
for (const path of ["/onlyfans/overview","/onlyfans/accounts","/onlyfans/inbox","/onlyfans/content","/onlyfans/sales","/onlyfans/settings","/onlyfans/launch","/onlyfans/operations","/api/onlyfans/accounts"])
 assert.equal(agencyOnlyFansRequest(path,"GET",false,true),true,path);
assert.equal(agencyOnlyFansRequest("/onlyfans/accounts","POST",true,true),false);
assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/of-176774528/handover","POST",false,false),false);
assert.equal(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/of-176774528/handover","POST",false,true),true);
assert.equal(agencyOnlyFansRequest("/admin","GET",false,true),false);
console.log("FLIRT OnlyFans verified-owner and retained request-boundary checks passed");
