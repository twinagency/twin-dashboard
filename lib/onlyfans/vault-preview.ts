/** Bounded binary half of the existing vault content contract. */
export const VAULT_PREVIEW_SCHEMA="vault-still.v1";
export const MAX_VAULT_PREVIEW_BYTES=8*1024*1024;
export function previewMime(bytes:Uint8Array):string|null {
  const starts=(prefix:number[])=>prefix.every((value,index)=>bytes[index]===value);
  if(starts([255,216,255]))return "image/jpeg";
  if(starts([137,80,78,71,13,10,26,10]))return "image/png";
  if(starts([71,73,70,56,55,97])||starts([71,73,70,56,57,97]))return "image/gif";
  if(bytes.length>=12&&starts([82,73,70,70])&&[87,69,66,80].every((value,index)=>bytes[index+8]===value))return "image/webp";
  return null;
}
export async function readVaultPreview(response:Response,accountId:string,mediaId:string) {
  const mime=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const length=response.headers.get("content-length");
  const reader=response.body?.getReader();
  if(!reader)throw new Error("Preview unavailable");
  let complete=false;
  try {
    if(response.status!==200||response.headers.get("X-OnlyFans-Preview")!==VAULT_PREVIEW_SCHEMA||
       response.headers.get("X-OnlyFans-Account-Id")!==accountId||response.headers.get("X-OnlyFans-Media-Id")!==mediaId||
       !["image/jpeg","image/png","image/gif","image/webp"].includes(mime??"")||
       ![null,"identity"].includes(response.headers.get("content-encoding"))||
       (length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_VAULT_PREVIEW_BYTES)))throw new Error("Preview unavailable");
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_VAULT_PREVIEW_BYTES)throw new Error("Preview unavailable");chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(!size||previewMime(bytes)!==mime||(length!==null&&Number(length)!==size))throw new Error("Preview unavailable");
    complete=true;return {bytes,mime:mime!};
  } finally {if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
