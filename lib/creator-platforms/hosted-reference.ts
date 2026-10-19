import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { configuredBackendPurpose } from "@/lib/onlyfans/backend-transport";

export type HostedReference = { accountId:string; userId:string; profileId:string; agencyId:string|null; issuedAt:number; nonce:string };
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=()=>{const config=configuredBackendPurpose("CONNECTION");if(!config)throw new Error("Connection service unavailable");return config.token;};
const mac=(scope:string,payload:string)=>createHmac("sha256",key()).update(scope+"\n"+payload).digest("base64url");
function equal(a:string,b:string){if(!/^[A-Za-z0-9_-]{43}$/.test(a)||!/^[A-Za-z0-9_-]{43}$/.test(b))return false;return timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function pack(id:string){if(!uuid.test(id))throw new Error("Invalid creator reference");return Buffer.from(id.replaceAll("-",""),"hex").toString("base64url");}
function unpack(value:string){if(!/^[A-Za-z0-9_-]{22}$/.test(value))throw new Error();const raw=Buffer.from(value,"base64url");if(raw.length!==16||raw.toString("base64url")!==value)throw new Error();const hex=raw.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
export function issueHostedReference(creator:{accountId:string;userId:string;agencyId:string|null},profileId:string){
  const payload=[pack(creator.accountId),pack(creator.userId),pack(profileId),creator.agencyId?pack(creator.agencyId):"-",Math.floor(Date.now()/1000).toString(36),randomBytes(16).toString("base64url")].join(".");
  return payload+"."+mac("twin-onlyfans-connect.v1",payload);
}
export function verifyHostedReference(value:unknown):HostedReference|null{
  try{
    if(typeof value!=="string"||value.length>255)return null;const parts=value.split(".");if(parts.length!==7)return null;
    const payload=parts.slice(0,6).join(".");if(!equal(parts[6],mac("twin-onlyfans-connect.v1",payload)))return null;
    if(!/^[a-z0-9]{1,10}$/.test(parts[4])||!/^[A-Za-z0-9_-]{22}$/.test(parts[5]))return null;
    const issuedAt=parseInt(parts[4],36),age=Math.floor(Date.now()/1000)-issuedAt;if(!Number.isSafeInteger(issuedAt)||age< -30||age>3600)return null;
    return{accountId:unpack(parts[0]),userId:unpack(parts[1]),profileId:unpack(parts[2]),agencyId:parts[3]==="-"?null:unpack(parts[3]),issuedAt,nonce:parts[5]};
  }catch{return null;}
}
export function sealHostedResume(value:unknown){const payload=Buffer.from(JSON.stringify(value)).toString("base64url");return payload+"."+mac("twin-onlyfans-resume.v1",payload);}
export function openHostedResume(value:string|undefined):Record<string,unknown>|null{
  try{if(!value||value.length>3000)return null;const parts=value.split(".");if(parts.length!==2||!equal(parts[1],mac("twin-onlyfans-resume.v1",parts[0])))return null;const parsed=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:null;}catch{return null;}
}
