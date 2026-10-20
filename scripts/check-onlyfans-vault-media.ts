import assert from 'node:assert/strict';
import {createVaultMediaBackend} from '../lib/onlyfans/vault-media-backend';
import {CONTENT_SCHEMA} from '../lib/onlyfans/content';
import {parseUploads,parseUploadAck,parseVideo,validUploadFiles,MAX_CHUNK_BYTES} from '../lib/onlyfans/vault-media';

async function main(){
 const id='fd2e6b88-4edb-43db-a654-e2025d57eece',fileId='af6b5c1e-79d0-4510-a5e2-535661d46a9f',account='acc-a';
 const file={fileId,name:'Synthetic.png',size:100,receivedBytes:0,prefixDigest:'a'.repeat(64),status:'receiving',mediaId:null,processing:false,error:null};
 const job={jobId:id,kind:'upload',status:'receiving',files:[file],lastError:null,cleanupRequired:false,requestedAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
 const read={schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,uploads:{schemaVersion:'of-vault-media.v1',accountId:account,maxFiles:40,maxFileBytes:4000*1024**2,chunkBytes:MAX_CHUNK_BYTES,enabled:true,jobs:[job]}};
 assert(parseUploads(read,account));assert.equal(parseUploads(read,'other-account'),null);
 for(const patch of [{chunkBytes:MAX_CHUNK_BYTES*2},{maxFiles:201},{maxFileBytes:-1},{providerUrl:'secret'},{enabled:'true'}])assert.equal(parseUploads({...read,uploads:{...read.uploads,...patch}},account),null);
 for(const patch of [{fileId:'invalid'},{receivedBytes:101},{prefixDigest:'bad'},{mediaId:'0'},{sourceUrl:'secret'},{size:true},{status:'accepted'}])assert.equal(parseUploadAck({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,upload:{...job,files:[{...file,...patch}]}},account),null);
 assert(validUploadFiles([{fileId,name:'synthetic.mp4',size:100}]));
 for(const patch of [{name:'../escape.mp4'},{size:0},{size:true},{sourceUrl:'https://caller.invalid'}])assert.equal(validUploadFiles([{fileId,name:'synthetic.mp4',size:100,...patch}]),false);
 const video={mediaId:'13',ready:true,status:'ready',bytes:100,lastError:null};
 assert(parseVideo({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,video},account,'13'));
 assert.equal(parseVideo({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:'foreign',video},account,'13'),null);
 let answer:Response, calls:Array<{url:string;init?:RequestInit}>=[];
 const backend=createVaultMediaBackend({baseUrl:'https://native.invalid',token:'synthetic-content-token',fetchImpl:(async(url,init)=>{calls.push({url:String(url),init});return answer;}) as typeof fetch});
 const headers={'Content-Type':'video/mp4','Content-Length':'20','Content-Range':'bytes 10-29/100','X-OnlyFans-Account-Id':account,'X-OnlyFans-Media-Id':'13','X-OnlyFans-Video':'vault-video.v1'};
 answer=new Response(new Uint8Array(20),{status:206,headers});
 let result=await backend.stream(account,'13','bytes=10-29');assert(result.ok);assert.equal((await new Response(result.body).arrayBuffer()).byteLength,20);
 assert.equal(calls[0].init?.credentials,'omit');assert.equal(calls[0].init?.redirect,'error');assert.equal(new Headers(calls[0].init?.headers).get('Range'),'bytes=10-29');
 for(const patch of [{'X-OnlyFans-Account-Id':'foreign'},{'X-OnlyFans-Media-Id':'14'},{'X-OnlyFans-Video':'unknown'},{'Content-Type':'text/html'},{'Content-Length':'0'},{'Content-Range':'bytes 10-30/100'},{'Content-Range':'bytes 10-29/20'},{'Content-Range':'bytes 29-10/100'}]){
  answer=new Response(new Uint8Array(20),{status:206,headers:{...headers,...patch}});assert.equal((await backend.stream(account,'13','bytes=10-29')).ok,false);
 }
 answer=new Response(new Uint8Array(10),{status:206,headers});const shortStream=await backend.stream(account,'13','bytes=10-29');assert(shortStream.ok);await assert.rejects(()=>new Response(shortStream.body).arrayBuffer());
 answer=new Response(new Uint8Array(21),{status:206,headers});const longStream=await backend.stream(account,'13','bytes=10-29');assert(longStream.ok);await assert.rejects(()=>new Response(longStream.body).arrayBuffer());
 answer=new Response(null,{status:206,headers});result=await backend.stream(account,'13','bytes=10-29',true);assert(result.ok&&result.body===null);
 answer=new Response(null,{status:416,headers:{'Content-Range':'bytes */100'}});result=await backend.stream(account,'13','bytes=999-');assert(result.ok&&result.status===416);
 answer=Response.json({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,jobId:id,fileId,receivedBytes:100});assert((await backend.chunk(account,id,fileId,0,'a'.repeat(64),new Uint8Array(100),'server-derived-actor')).ok);
 assert.equal(new Headers(calls.at(-1)?.init?.headers).get('X-OnlyFans-Actor'),'server-derived-actor');
 const count=calls.length;assert.equal((await backend.chunk(account,id,fileId,0,'a'.repeat(64),new Uint8Array(MAX_CHUNK_BYTES+1),'actor')).ok,false);assert.equal(calls.length,count);
 console.log('Native vault media contract PASS: manifests, scopes, private transport, chunk bounds, range semantics, HEAD, 416 and truncated/oversized stream rejection');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
