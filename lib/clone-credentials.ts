import { requireCloneAccess } from "./dashboard-access";
import { serviceClient } from "./supabase-service";
/** Server-side Telegram calls only. Never serialize the token to a browser. */
export async function cloneBotToken(cloneId:string):Promise<string|null> {
  await requireCloneAccess(cloneId);
  const {data,error}=await serviceClient().from("clones").select("bot_token").eq("id",cloneId).maybeSingle();
  if(error) throw new Error("Creator connection unavailable");
  return data?.bot_token??null;
}
