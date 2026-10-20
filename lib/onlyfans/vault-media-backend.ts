import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { CONTENT_HEADER, CONTENT_SCHEMA } from "./content";
import { parseUploads, parseUploadAck, parseVideo, mediaObject, MAX_CHUNK_BYTES } from "./vault-media";

type Identity={actor:string;commandKey:string};
const refused=(status=503)=>({ok:false as const,status,error:"The media request could not be confirmed. Refresh its recorded status before retrying."});
export function createVaultMediaBackend(options:{baseUrl:string;token:string;fetchImpl?:typeof fetch}) {
  const fetcher=options.fetchImpl??fetch,call=createBackendTransport(fetcher);
  const base=(account:string)=>options.baseUrl.replace(/\/+$/,"")+`/onlyfans/content/v1/accounts/${encodeURIComponent(account)}/vault`;
  const headers={Authorization:`Bearer ${options.token}`,[CONTENT_HEADER]:CONTENT_SCHEMA};
  async function json(account:string,path:string,body?:unknown) {
    try {
      const response=await call(base(account)+path,{method:body===undefined?"GET":"POST",headers:{...headers,...(body===undefined?{}:{"Content-Type":"application/json"})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok)return refused([400,401,403,404,409,413,429,503].includes(response.status)?response.status:502);
      return {ok:true as const,body:await response.json() as unknown};
    } catch{return refused(502);}
  }
  return {
    async uploads(account:string){const r=await json(account,"/uploads");if(!r.ok)return r;const data=parseUploads(r.body,account);return data?{ok:true as const,data}:refused();},
    async create(account:string,body:{files:Array<{fileId:string;name:string;size:number}>;expectedConnectionRevision:number}&Identity){
      const r=await json(account,"/uploads",body);if(!r.ok)return r;const upload=parseUploadAck(r.body,account);return upload?{ok:true as const,upload}:refused(502);
    },
    async action(account:string,job:string,action:"finish"|"cancel",identity:Identity){
      const r=await json(account,`/uploads/${job}/${action}`,identity);if(!r.ok)return r;const upload=parseUploadAck(r.body,account);return upload?.jobId===job?{ok:true as const,upload}:refused(502);
    },
    async chunk(account:string,job:string,file:string,offset:number,digest:string,bytes:Uint8Array,actor:string){
      if(!bytes.length||bytes.length>MAX_CHUNK_BYTES)return refused(413);
      try {
        const r=await call(base(account)+`/uploads/${job}/files/${file}?offset=${offset}`,{method:"POST",headers:{...headers,"Content-Type":"application/octet-stream",
          "X-Upload-SHA256":digest,"X-OnlyFans-Actor":actor},body:Buffer.from(bytes),timeoutMs:30_000});
        if(!r.ok)return refused([400,401,403,404,409,413,429,503].includes(r.status)?r.status:502);
        const v:unknown=await r.json();
        if(mediaObject(v)&&v.schemaVersion===CONTENT_SCHEMA&&v.ok===true&&v.accountId===account&&v.jobId===job&&v.fileId===file
          &&Number.isSafeInteger(v.receivedBytes)&&(v.receivedBytes as number)>=offset+bytes.length)return {ok:true as const,receivedBytes:v.receivedBytes as number};
      }catch{/* Lost replies preserve the exact chunk identity. */}
      return refused(502);
    },
    async video(account:string,media:string,identity?:Identity){const r=await json(account,`/videos/${media}`,identity);if(!r.ok)return r;
      const video=parseVideo(r.body,account,media);return video?{ok:true as const,video}:refused();},
    async stream(account:string,media:string,range:string|null,head=false){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try {
        const r=await fetcher(base(account)+`/videos/${media}/stream`,{method:head?"HEAD":"GET",headers:{...headers,...(range?{Range:range}:{})},
          credentials:"omit",redirect:"error",cache:"no-store",signal:controller.signal});
        clearTimeout(timer);
        if(r.status===416){await r.body?.cancel();const value=r.headers.get("content-range");
          if(!value||!/^bytes \*\/[0-9]+$/.test(value)||!Number.isSafeInteger(Number(value.slice(8))))return refused();
          return {ok:true as const,status:416,body:null,headers:new Headers({"Content-Range":value})};}
        if(![200,206].includes(r.status)||r.headers.get("X-OnlyFans-Account-Id")!==account||r.headers.get("X-OnlyFans-Media-Id")!==media
          ||r.headers.get("X-OnlyFans-Video")!=="vault-video.v1"||!["video/mp4","video/webm"].includes(r.headers.get("content-type")??"")){
          await r.body?.cancel();return refused(r.status===404?404:503);
        }
        const length=Number(r.headers.get("content-length"));
        if(!Number.isSafeInteger(length)||length<1||length>64*1024**3){await r.body?.cancel();return refused();}
        const resultHeaders=new Headers({"Content-Type":r.headers.get("content-type")!,"Content-Length":String(length),"Accept-Ranges":"bytes"});
        if(r.status===206){const value=r.headers.get("content-range"),match=value?.match(/^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/);
          const start=Number(match?.[1]),end=Number(match?.[2]),total=Number(match?.[3]);
          if(!match||![start,end,total].every(Number.isSafeInteger)||start<0||end<start||end>=total||end-start+1!==length||total>64*1024**3){await r.body?.cancel();return refused();}
          resultHeaders.set("Content-Range",value!);}
        if(head){await r.body?.cancel();return {ok:true as const,status:r.status,body:null,headers:resultHeaders};}
        if(!r.body)return refused();
        const reader=r.body.getReader();let remaining=length;
        const body=new ReadableStream<Uint8Array>({async pull(out){try{const value=await reader.read();if(value.done){if(remaining!==0)throw Error("Incomplete media");out.close();return;}
          remaining-=value.value.byteLength;if(remaining<0)throw Error("Media exceeded its declared size");out.enqueue(value.value);}catch(error){await reader.cancel();out.error(error);}},async cancel(){await reader.cancel();}});
        return {ok:true as const,status:r.status,body,headers:resultHeaders};
      }catch{return refused();}finally{clearTimeout(timer);}
    }
  };
}
export function configuredVaultMediaBackend(fetchImpl?: typeof fetch){const options=configuredBackendPurpose("CONTENT");return options?createVaultMediaBackend({ ...options, fetchImpl }):null;}
