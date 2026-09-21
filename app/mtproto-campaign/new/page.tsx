import { listCreators } from "@/lib/mtproto/clones";
import RunBuilderForm from "@/components/mtproto/RunBuilderForm";

export const dynamic = "force-dynamic";

// Run builder (prompt steps 1-4): pick creators, filter the audience,
// Preview (read-only), then create as a dry run. Confirm LIVE lives on the
// run detail page, deliberately separate (step 5).
export default async function NewMtprotoRunPage() {
  const creators = await listCreators();
  return (
    <div className="dashboard-page">
      <h1 className="mb-1 text-2xl font-semibold">New MTProto run</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Preview costs nothing and writes nothing. Creating a run always starts as a dry run — going live is a separate, later step.
      </p>
      <RunBuilderForm creators={creators} />
    </div>
  );
}
