import {NextRequest,NextResponse} from "next/server";
import {connectionSignInCommand,createConnectionCreator} from "@/lib/onlyfans/connection-creators";
import {connectionAnswer} from "@/lib/onlyfans-connections/route";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function POST(request:NextRequest){
 const ctx=await connectionSignInCommand(request);if(ctx instanceof NextResponse)return ctx;
 const creator=await createConnectionCreator(ctx,ctx.body);
 return creator instanceof NextResponse?creator:connectionAnswer({ok:true,creator});
}
