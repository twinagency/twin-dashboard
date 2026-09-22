import { getCreators } from "@/components/mtproto/data";
import RunBuilderForm from "@/components/mtproto/RunBuilderForm";

export const dynamic = "force-dynamic";

// Run builder (prompt steps 1-4): pick creators, set limits, Preview
// (read-only), then create as a dry run. Confirm LIVE lives on the run detail
// page, deliberately separate (step 5).
export default async function NewMtprotoRunPage() {
  const creators = await getCreators();
  return <RunBuilderForm creators={creators} />;
}
