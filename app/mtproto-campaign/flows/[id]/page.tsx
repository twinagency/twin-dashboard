import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreators } from "@/components/mtproto/data";
import FlowEditor from "@/components/mtproto/flows/FlowEditor";
import { Notice } from "@/components/mtproto/kit";
import { loadFlowPicker } from "@/lib/mtproto/flow-media";
import { flowStats, getFlow, getFlowsGlobalSwitch } from "@/lib/mtproto/flows";
import { signMedia } from "@/lib/mtproto/flow-sign";

export const dynamic = "force-dynamic";

export default async function EditFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [read, global, creators] = await Promise.all([getFlow(id), getFlowsGlobalSwitch(), getCreators()]);
  if (!read.installed) {
    return (
      <Notice tone="info" title="Flows are not installed yet">
        The database migration for flows has not been applied. <Link href="/mtproto-campaign/flows" className="font-semibold underline">Back to flows</Link>
      </Notice>
    );
  }
  if (read.error) return <Notice tone="crit">Could not read this flow: {read.error}</Notice>;
  if (!read.data) notFound();
  const flow = read.data;
  const [picker, st] = await Promise.all([loadFlowPicker(flow.cloneId, signMedia), flowStats(flow.id)]);
  return <FlowEditor flow={flow} creators={creators} initialPicker={picker} stats={st.stats} globalOn={global.on} />;
}
