import { CONTENT_SCHEMA } from "./content";
import { vaultMediaId } from "./vault";

export const MEDIA_SCHEMA = "of-vault-media.v1";
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
export type UploadFile = { fileId:string; name:string; size:number; receivedBytes:number; prefixDigest:string|null;
  status:string; mediaId:string|null; processing:boolean; error:string|null };
export type UploadJob = { jobId:string; kind:"upload"; status:string; files:UploadFile[];
  lastError:string|null; cleanupRequired:boolean; requestedAt:string; updatedAt:string };
export type UploadRead = { schemaVersion:typeof MEDIA_SCHEMA; accountId:string; maxFiles:number;
  maxFileBytes:number; chunkBytes:number; enabled:boolean; jobs:UploadJob[] };
export type VideoState = { mediaId:string; ready:boolean; status:string; bytes:number|null; lastError:string|null };
export const mediaObject = (v:unknown):v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);
export const mediaUuid = (v:unknown):v is string => typeof v==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const integer = (v:unknown,min=0,max=64*1024**3):v is number => Number.isSafeInteger(v) && (v as number)>=min && (v as number)<=max;
const text = (v:unknown,max=512):v is string => typeof v==="string" && v.isWellFormed() && !/[\x00-\x1f\x7f]/.test(v) && new TextEncoder().encode(v).length<=max;
const code = (v:unknown) => v===null || typeof v==="string" && /^[a-z0-9_]{1,80}$/.test(v);
const hash = (v:unknown) => typeof v==="string" && /^[a-f0-9]{64}$/.test(v);
const stamp = (v:unknown) => typeof v==="string" && /Z$/.test(v) && Number.isFinite(Date.parse(v));
const exact = (v:Record<string,unknown>,keys:string[]) => Object.keys(v).sort().join(",") === keys.sort().join(",");
export const uploadStatuses = ["receiving","pending","running","complete","failed","interrupted","superseded","expired"];
export function validUploadFiles(value:unknown):value is Array<{fileId:string;name:string;size:number}> {
  if(!Array.isArray(value)||!value.length||value.length>200)return false;
  const ids=new Set<string>();
  return value.every(f=>mediaObject(f)&&exact(f,["fileId","name","size"])&&mediaUuid(f.fileId)&&!ids.has(f.fileId)&&!!ids.add(f.fileId)
    &&text(f.name,240)&&!!f.name&&!/[\\/]/.test(f.name)&&integer(f.size,1));
}
function file(value:unknown):value is UploadFile {
  return mediaObject(value)&&exact(value,["fileId","name","size","receivedBytes","prefixDigest","status","mediaId","processing","error"])
    &&mediaUuid(value.fileId)&&text(value.name,240)&&integer(value.size,1)&&integer(value.receivedBytes,0,value.size as number)
    &&(value.prefixDigest===null||hash(value.prefixDigest))&&["receiving","staged","pending","uploading","done","failed","skipped"].includes(value.status as string)
    &&(value.mediaId===null||vaultMediaId(value.mediaId))&&typeof value.processing==="boolean"&&(value.error===null||text(value.error));
}
export function parseUploadJob(value:unknown):UploadJob|null {
  if(!mediaObject(value)||!exact(value,["jobId","kind","status","files","lastError","cleanupRequired","requestedAt","updatedAt"])
    ||!mediaUuid(value.jobId)||value.kind!=="upload"||!uploadStatuses.includes(value.status as string)||!Array.isArray(value.files)
    ||!value.files.length||value.files.length>200||!value.files.every(file)||new Set(value.files.map(f=>f.fileId)).size!==value.files.length
    ||!code(value.lastError)||typeof value.cleanupRequired!=="boolean"||!stamp(value.requestedAt)||!stamp(value.updatedAt))return null;
  return value as UploadJob;
}
export function parseUploads(body:unknown,accountId:string):UploadRead|null {
  if(!mediaObject(body)||body.schemaVersion!==CONTENT_SCHEMA||body.ok!==true||body.accountId!==accountId||!mediaObject(body.uploads))return null;
  const v=body.uploads;
  if(!exact(v,["schemaVersion","accountId","maxFiles","maxFileBytes","chunkBytes","enabled","jobs"])||v.schemaVersion!==MEDIA_SCHEMA
    ||v.accountId!==accountId||!integer(v.maxFiles,1,200)||!integer(v.maxFileBytes,1)||v.chunkBytes!==MAX_CHUNK_BYTES
    ||typeof v.enabled!=="boolean"||!Array.isArray(v.jobs)||v.jobs.length>20)return null;
  const jobs=v.jobs.map(parseUploadJob);if(jobs.some(j=>j===null))return null;
  return {...v,jobs} as UploadRead;
}
export function parseUploadAck(body:unknown,accountId:string):UploadJob|null {
  return mediaObject(body)&&body.schemaVersion===CONTENT_SCHEMA&&body.ok===true&&body.accountId===accountId?parseUploadJob(body.upload):null;
}
export function parseVideo(body:unknown,accountId:string,mediaId:string):VideoState|null {
  if(!mediaObject(body)||body.schemaVersion!==CONTENT_SCHEMA||body.ok!==true||body.accountId!==accountId||!mediaObject(body.video))return null;
  const v=body.video;
  if(!exact(v,["mediaId","ready","status","bytes","lastError"])||v.mediaId!==mediaId||typeof v.ready!=="boolean"
    ||!["ready","unprepared",...uploadStatuses].includes(v.status as string)||(v.bytes!==null&&!integer(v.bytes,1))||!code(v.lastError))return null;
  return v as VideoState;
}
