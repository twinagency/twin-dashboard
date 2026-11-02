import { getCreators } from "@/components/mtproto/data";
import FlowEditor from "@/components/mtproto/flows/FlowEditor";
import { emptyPicker } from "@/lib/mtproto/flow-media";
import { getFlowsGlobalSwitch } from "@/lib/mtproto/flows";

export const dynamic = "force-dynamic";

export default async function NewFlowPage() {
  const [creators, global] = await Promise.all([getCreators(), getFlowsGlobalSwitch()]);
  return <FlowEditor flow={null} creators={creators} initialPicker={emptyPicker()} stats={null} globalOn={global.on} />;
}
