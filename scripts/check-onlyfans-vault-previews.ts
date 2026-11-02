import assert from "node:assert/strict";
import { readVaultPreview, MAX_VAULT_PREVIEW_BYTES } from "../lib/onlyfans/vault-preview";
import { createVaultBackend } from "../lib/onlyfans/vault-backend";
import { CONTENT_HEADER, CONTENT_SCHEMA } from "../lib/onlyfans/content";

async function main(){
 const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
 const headers={"content-type":"image/png","X-OnlyFans-Preview":"vault-still.v1","X-OnlyFans-Account-Id":"acc-a","X-OnlyFans-Media-Id":"11"};
 assert.equal((await readVaultPreview(new Response(png,{headers}),"acc-a","11")).bytes.length,png.length);
 const badHeaders:Record<string,string>[]=[{"X-OnlyFans-Account-Id":"acc-b"},{"X-OnlyFans-Media-Id":"12"},{"content-type":"image/svg+xml"},{"X-OnlyFans-Preview":"unknown"},{"content-length":String(MAX_VAULT_PREVIEW_BYTES+1)},{"content-length":"7"},{"content-encoding":"gzip"}];
 for(const changed of badHeaders)
  await assert.rejects(readVaultPreview(new Response(png,{headers:{...headers,...changed}}),"acc-a","11"));
 await assert.rejects(readVaultPreview(new Response("<html>",{headers}),"acc-a","11"));
 let canceled=false;
 const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(MAX_VAULT_PREVIEW_BYTES+1));},cancel(){canceled=true;}});
 await assert.rejects(readVaultPreview(new Response(stream,{headers}),"acc-a","11"));assert(canceled,"oversized upstream body must be canceled");
 let calls=0;
 const backend=createVaultBackend({baseUrl:"http://native.invalid",token:"synthetic-content",fetchImpl:async(input,init)=>{
  calls++;assert.equal(String(input),"http://native.invalid/onlyfans/content/v1/accounts/acc-a/vault/previews/11");
  assert.equal(init?.method,"GET");assert.equal(init?.redirect,"error");assert.equal(init?.cache,"no-store");
  assert.equal((init?.headers as Record<string,string>)[CONTENT_HEADER],CONTENT_SCHEMA);
  return new Response(png,{headers});
 }});
 assert((await backend.preview("acc-a","11")).ok);assert.equal(calls,1);
 console.log("Vault preview contracts PASS: exact binary scope/schema/type, bounded canceled streams and existing one-attempt content transport");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
