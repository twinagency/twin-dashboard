'use strict';
const assert = require('node:assert/strict');
const { run, TARGET, MOXY, PROJECT, EXPECTED_SHA } = require('./clear-flirt-test-20261005.cjs');
async function scenario(brand, blocked = '') {
  const target = brand === 'flirt' ? TARGET : MOXY;
  let user = { id: target.auth, created_at: target.created }, account = brand === 'flirt' ? { id: TARGET.account,auth_user_id:TARGET.auth,display_name:'Jesse Test',account_status:'applicant',created_at:TARGET.accountCreated } : null;
  let memberships = brand === 'moxy' ? [{ user_id:MOXY.auth,agency_id:MOXY.agency,active:true }] : [];
  if (blocked === 'membership') memberships.push({ user_id:target.auth,agency_id:'unapproved',active:true });
  const mutations = [];
  const env = { GIT_SHA:EXPECTED_SHA, SUPABASE_URL:`https://${brand === 'flirt' ? PROJECT : 'aouaenqayfltoqrmpitg'}.supabase.co`, SUPABASE_SERVICE_KEY:'test-only', ...(brand === 'flirt' ? {FLIRT_BACKEND_ENABLED:'true',FLIRT_SUPABASE_PROJECT_REF:PROJECT} : {}) };
  const request = async (url,options) => {
    const u = new URL(url), body = options.body ? JSON.parse(options.body) : null;
    assert.equal(u.origin, env.SUPABASE_URL);
    function json(data,status=200) {return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
    if (u.pathname.startsWith('/auth/v1/admin/users/')) {
      assert.equal(u.pathname,'/auth/v1/admin/users/'+target.auth);
      if(options.method === 'GET') return user ? json(user) : json({code:'user_not_found'},404);
      assert.equal(options.method,'DELETE'); mutations.push(body.should_soft_delete ? 'revoke-sessions' : 'hard-delete-auth');
      if(body.should_soft_delete) user.deleted_at='2026-10-05T07:40:00Z'; else {user=null;memberships=[];}
      return json({});
    }
    if (u.pathname.startsWith('/storage/v1/object/list/')) return json(blocked === 'storage' ? [{name:'unexpected'}] : []);
    const table=u.pathname.split('/').at(-1);
    if(table === 'creator_accounts') {
      if(options.method === 'DELETE') {
        assert.equal(u.searchParams.get('id'),'eq.'+TARGET.account); assert.equal(u.searchParams.get('auth_user_id'),'eq.'+TARGET.auth);
        assert.ok(user.deleted_at); mutations.push('delete-creator'); const old=account; account=null; return json([old]);
      }
      return json(account ? [account] : []);
    }
    if(table === 'agency_memberships') return json(memberships);
    return json(blocked === 'media' && table === 'creator_files' ? [{creator_account_id:TARGET.account}] : []);
  };
  if(blocked) {await assert.rejects(run(env,request,brand));assert.deepEqual(mutations,[]);}
  else {
    await run(env,request,brand);
    assert.deepEqual(mutations,brand === 'flirt' ? ['revoke-sessions','delete-creator','hard-delete-auth'] : ['revoke-sessions','hard-delete-auth']);
    const length=mutations.length; await run(env,request,brand);assert.equal(mutations.length,length);
  }
}
(async()=>{for(const brand of ['flirt','moxy']) {await scenario(brand);await scenario(brand,'membership');} await scenario('flirt','media');await scenario('flirt','storage');await assert.rejects(run({},()=>{throw new Error('Network must not be reached')}));console.log('Exact identity, backend, agency/media guards, session revocation order and idempotent retry checks passed.');})().catch(e=>{console.error(e);process.exitCode=1});
