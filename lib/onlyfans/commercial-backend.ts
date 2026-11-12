import {createBackendTransport,configuredBackendPurpose} from "./backend-transport";
import {CONFIGURATION_HEADER,CONFIGURATION_SCHEMA} from "./configuration";
import {parseCommercialState,parseCoverage,type CommercialCommand} from "./commercial-scope";
type Command=Omit<CommercialCommand,"requestId">&{actor:string;commandKey:string};
/** Commercial scope (promote/stop/read) and history coverage (read) over the configuration purpose credential. */
export function configuredCommercialBackend(fetchImpl:typeof fetch){
 const options=configuredBackendPurpose("CONFIGURATION");if(!options)return null;
 const call=createBackendTransport(fetchImpl);
 const url=(account:string,leaf:string)=>options.baseUrl.replace(/\/+$/,"")+"/onlyfans/configuration/v1/accounts/"+encodeURIComponent(account)+"/"+leaf;
 const headers={Authorization:"Bearer "+options.token,[CONFIGURATION_HEADER]:CONFIGURATION_SCHEMA};
 const refused={ok:false as const,outcome:"refused" as const};
 return {
  async read(account:string,leaf:"commercial"|"history-coverage"){
   try{
    const response=await call(url(account,leaf),{method:"GET",headers});
    if(response.ok){
     const body=await response.json();
     const data=body.schemaVersion===CONFIGURATION_SCHEMA&&body.ok===true&&body.accountId===account
      ?(leaf==="commercial"?parseCommercialState(body.commercial,account):parseCoverage(body.coverage)):null;
     if(data)return {ok:true as const,data};
    }else if([400,401,403,404,409,503].includes(response.status)){await response.body?.cancel();return {...refused,status:response.status,error:"The status was not available. Refresh and check the account."};}
   }catch{}
   return {...refused,status:503,error:"The status could not be read."};
  },
  async write(account:string,command:Command){
   try{
    const response=await call(url(account,"commercial"),{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(command)});
    if(response.ok){
     const body=await response.json();
     const data=body.schemaVersion===CONFIGURATION_SCHEMA&&body.ok===true&&body.accountId===account&&body.commandKey===command.commandKey
      ?parseCommercialState(body.commercial,account):null;
     if(data)return {ok:true as const,data};
    }else if([400,401,403,404,409,413,503].includes(response.status)){
     await response.body?.cancel();
     return {...refused,status:response.status,error:"The commercial scope command was refused. Refresh and check the prepared connection, disabled runtime and limits."};
    }
   }catch{}
   return {ok:false as const,status:502,outcome:"unconfirmed" as const,error:"The outcome is unconfirmed. Retry the same request."};
  },
 };
}
