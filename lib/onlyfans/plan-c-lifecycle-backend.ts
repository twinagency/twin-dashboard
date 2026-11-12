import {createBackendTransport,configuredBackendPurpose} from "./backend-transport";
import {PLAN_C_HEADER,PLAN_C_SCHEMA} from "./plan-c";
type RecordValue=Record<string,unknown>;
const object=(v:unknown):v is RecordValue=>!!v&&typeof v==="object"&&!Array.isArray(v);
export type LifecycleCommand={action:"activate"|"stop"|"autonomous"|"supervised";expectedRevision:number;commandKey:string;reason:string};
export async function lifecycle(account:string,actor:string,command?:LifecycleCommand){
 const options=configuredBackendPurpose("CONTROL");
 if(!options)return {status:503,body:{ok:false,error:"Pilot controls are not configured."}};
 const call=createBackendTransport(),root=options.baseUrl.replace(/\/+$/,"")+"/onlyfans/control/v2/accounts/"+encodeURIComponent(account)+"/pilot-scope";
 const headers={Authorization:"Bearer "+options.token,[PLAN_C_HEADER]:PLAN_C_SCHEMA,"X-Plan-C-Actor":actor};
 try{
  const read=await call(root,{headers}),value:unknown=read.ok?await read.json():null;
  if(!object(value)||value.schemaVersion!==PLAN_C_SCHEMA||value.accountId!==account||!object(value.config)||!Number.isSafeInteger(value.revision))
   return {status:read.status===404?404:503,body:{ok:false,error:"Current pilot configuration is unavailable."}};
  const mode=value.config.authorization_mode,status=value.status,revision=value.revision;
  if(!command)return {status:200,body:{ok:true,scope:{mode,status,revision,fanCount:Array.isArray(value.config.fans)?value.config.fans.length:0}}};
  const changingMode=["autonomous","supervised"].includes(command.action);
  const payload={expectedRevision:command.expectedRevision,commandKey:command.commandKey,actor,reason:command.reason,
    ...(changingMode?{config:{...value.config,authorization_mode:command.action}}:{status:command.action==="activate"?"active":"stopped"})};
  const response=await call(root+(changingMode?"/configure":"/status"),{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const ack:unknown=await response.json();
  if(response.ok&&object(ack)&&ack.schemaVersion===PLAN_C_SCHEMA&&ack.accountId===account&&Number.isSafeInteger(ack.revision)&&typeof ack.fingerprint==="string")
   return {status:200,body:{ok:true,revision:ack.revision,status:ack.status,replayed:ack.replayed===true}};
  if([400,401,403,404,409,410,413,422].includes(response.status))
   return {status:response.status,body:{ok:false,outcome:"refused",error:"Refused. Refresh the current scope and review its eligibility."}};
 }catch{/* A write may have committed; retain the exact command for a retry. */}
 return {status:502,body:{ok:false,outcome:command?"unconfirmed":"unavailable",error:command?"Outcome unconfirmed. Retry the same request.":"Current pilot configuration is unavailable."}};
}
