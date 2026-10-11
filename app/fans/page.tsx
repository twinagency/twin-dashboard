import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { activeViewAs } from "@/lib/view-as";
import FanWorkspace from "@/components/fans/FanWorkspace";
import RonanDemoProfile from "@/components/inbox/RonanDemoProfile";
import { creators, authoredFans } from "@/components/fans/data";

export const dynamic = "force-dynamic";
export default async function FanProfilesPage(props: {searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  if (!await hasInternalAdminAccess()) redirect("/twin");
  if (await activeViewAs(await cookies())) redirect("/revenue");
  const params=await props?.searchParams;
  if(params?.presentation==="movie-night"&&params.creator==="briana"&&params.fan==="briana-ronan-demo")return <RonanDemoProfile step={typeof params.step==="string"?params.step:0} mode={typeof params.mode==="string"?params.mode:undefined}/>;
  return <FanWorkspace creators={creators} fans={authoredFans} includeBriannaLedger />;
}
