import { getCreators } from "@/components/mtproto/data";
import RunBuilderForm from "@/components/mtproto/RunBuilderForm";
import { listFlows } from "@/lib/mtproto/flows";

export const dynamic = "force-dynamic";

// Run builder (prompt steps 1-4): pick creators, set limits, Preview
// (read-only), then create as a dry run. Confirm LIVE lives on the run detail
// page, deliberately separate (step 5). The optional follow-up flow list is
// empty (so the select is hidden) when flows are not installed.
export default async function NewMtprotoRunPage() {
  const [creators, flows] = await Promise.all([getCreators(), listFlows()]);
  return (
    <RunBuilderForm
      creators={creators}
      flows={flows.data.map((f) => ({ id: f.id, name: f.name, cloneId: f.cloneId, steps: f.steps.length }))}
    />
  );
}
