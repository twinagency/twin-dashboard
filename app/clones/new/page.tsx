import Link from "next/link";
import CreateCloneForm from "@/components/CreateCloneForm";
import { getCloneDefaults } from "@/app/settings/actions";
import { Info } from "@/components/clone/fields";

export const dynamic = "force-dynamic";

export default async function NewClonePage() {
  const defaults = await getCloneDefaults();
  return (
    <div className="dashboard-page">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/clones" className="text-sm font-medium text-muted transition hover:text-ink">
          ← Back to creators
        </Link>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          Before you start
          <Info text="Fill everything in and hit Create. Nothing is saved until then. After creating, you will land on the full page to upload photos, videos and bundles." />
        </span>
      </div>
      <CreateCloneForm defaults={defaults} />
    </div>
  );
}
