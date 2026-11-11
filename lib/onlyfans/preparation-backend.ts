import {createBackendTransport,configuredBackendPurpose} from "./backend-transport";
import {CONFIGURATION_HEADER,CONFIGURATION_SCHEMA} from "./configuration";
import {parsePreparationState,type PreparationCommand} from "./preparation";
export function configuredPreparationBackend(fetchImpl:typeof fetch){
 const options=configuredBackendPurpose("CONFIGURATION");if(!options)return null;
 const call=createBackendTransport(fetchImpl);
 return {async request(account:string,command?:(Omit<PreparationCommand,"requestId">&{actor:string;commandKey:string})){
  try{
   const response=await call(options.baseUrl.replace(/\/+$/,"")+"/onlyfans/configuration/v1/accounts/"+encodeURIComponent(account)+"/preparation",
    {method:command?"POST":"GET",headers:{Authorization:"Bearer "+options.token,[CONFIGURATION_HEADER]:CONFIGURATION_SCHEMA,...(command?{"Content-Type":"application/json"}:{})},
     ...(command?{body:JSON.stringify(command)}:{})});
   if(response.ok){
    const body=await response.json();
    const state=body.schemaVersion===CONFIGURATION_SCHEMA&&body.ok===true&&body.accountId===account&&(!command||body.commandKey===command.commandKey)?parsePreparationState(body.preparation):null;
    if(state)return {ok:true as const,preparation:state};
   }else if([400,401,403,404,409,413,503].includes(response.status)){
    return {ok:false as const,status:response.status,outcome:"refused" as const,error:"Preparation was refused. Refresh the status and check the account, connector and budget."};
   }
  }catch{}
  return {ok:false as const,status:command?502:503,outcome:command?"unconfirmed" as const:"refused" as const,
   error:command?"The outcome is unconfirmed. Retry the same request.":"Preparation status could not be read."};
 }};
}
