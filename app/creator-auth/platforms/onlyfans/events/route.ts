import { NextRequest,NextResponse } from "next/server";
import { hostedConfigured,limitedBytes,validProviderSignature,submitHostedConnection } from "@/lib/creator-platforms/hosted-server";
import { object,connectionOwner } from "@/lib/onlyfans-connections/contract";
import { parseCommandJson } from "@/lib/onlyfans/command-json";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest){
  if(!hostedConfigured())return reply({ok:false},503);
  if(request.headers.has("next-action")||request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return reply({ok:false},400);
  let bytes:Uint8Array;try{bytes=await limitedBytes(request.body,131072);}catch{return reply({ok:false},400);}
  if(!validProviderSignature(bytes,request.headers.get("signature")))return reply({ok:false},403);
  let body:unknown;try{body=parseCommandJson(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{return reply({ok:false},400);}
  if(!object(body)||typeof body.event!=="string")return reply({ok:false},400);
  if(body.event!=="accounts.connected")return reply({ok:true,ignored:true});
  const payload=body.payload;
  if(!object(payload)||typeof payload.client_reference_id!=="string")return reply({ok:true,ignored:true});
  const owner=connectionOwner(String(payload.onlyfans_id||""));
  if(!owner||typeof payload.onlyfans_username!=="string"||typeof body.account_id!=="string")return reply({ok:false},400);
  try{
    const result=await submitHostedConnection(payload.client_reference_id,body.account_id,owner,payload.onlyfans_username);
    return result.ok?reply({ok:true}):reply({ok:false},503);
  }catch{return reply({ok:false},409);}
}
