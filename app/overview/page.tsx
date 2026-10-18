import CombinedEarnings from "@/components/CombinedEarnings";
import { requireOperatorSurface } from "@/lib/channel-scope";
export const dynamic="force-dynamic";
export default async function OverviewPage(){
 await requireOperatorSurface();
 return <CombinedEarnings/>;
}
