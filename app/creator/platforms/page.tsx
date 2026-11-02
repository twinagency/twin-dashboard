import { NextResponse } from "next/server";
import CreatorPlatforms from "@/components/creator-platforms/CreatorPlatforms";
import { platformIdentity, platformSnapshot } from "@/lib/creator-platforms/server";
export const dynamic="force-dynamic";
export default async function CreatorPlatformsPage(){
  const creator=await platformIdentity();if(creator instanceof NextResponse)return <p>Sign in to your creator account to manage its platforms.</p>;
  try{return <CreatorPlatforms initial={await platformSnapshot(creator)}/>;}catch{return <section className="space-y-3"><h1 className="text-3xl font-semibold">Your platforms</h1><p role="status">Your platform setup is temporarily unavailable. Refresh to try again.</p></section>;}
}
