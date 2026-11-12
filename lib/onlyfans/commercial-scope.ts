/** Commercial scope and history coverage, as the dashboard sends and reads them. The backend is the validator and the authority:
 * promotion grants nothing (the account stays configured with sending and delivery disabled); launch is a separate decision of the
 * named operator. These checks only keep malformed or unreviewed shapes off the wire. */
export type CommercialCommand=
 {action:"promote";expectedRevision:number;requestId:string;reason:string;config:Record<string,unknown>}|
 {action:"stop";expectedRevision:number;requestId:string;reason:string};
const REQUIRED=["fans","creator_profile","delivery_mode","operator","model","limits"];
const OPTIONAL=["catalogue","coexistence"];
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const integer=(v:unknown,lo:number,hi:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=lo&&Number(v)<=hi;
export function validCommercialCommand(v:unknown):v is CommercialCommand{
 if(!obj(v)||!["promote","stop"].includes(String(v.action)))return false;
 const keys=["action","expectedRevision","requestId","reason",...(v.action==="promote"?["config"]:[])];
 if(Object.keys(v).length!==keys.length||!keys.every(k=>k in v)||!integer(v.expectedRevision,1,2147483647)||
  typeof v.requestId!=="string"||!(/^[0-9a-f-]{36}$/).test(v.requestId)||typeof v.reason!=="string"||!v.reason.trim()||v.reason.length>512)return false;
 if(v.action==="stop")return true;
 const config=v.config;
 return obj(config)&&REQUIRED.every(k=>k in config)&&Object.keys(config).every(k=>REQUIRED.includes(k)||OPTIONAL.includes(k));
}
export function parseCommercialState(v:unknown,accountId:string):Record<string,unknown>|null{
 if(!obj(v)||v.accountId!==accountId)return null;
 return ["none","legacy","preparation","commercial"].includes(String(v.state))||v.contractVersion==="commercial.v1"?v:null;
}
export function parseCoverage(v:unknown):Record<string,unknown>|null{
 return obj(v)&&typeof v.configured==="boolean"?v:null;
}
