import Link from "next/link";
import CreateCloneForm from "@/components/CreateCloneForm";
import { getCloneDefaults } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function NewClonePage() {
  const defaults = await getCloneDefaults();
  return (
    <div>
      <Link href="/clones" className="text-sm text-muted hover:text-ink">
        ← Back
      </Link>
      <p className="mb-6 mt-3 text-sm text-muted">
        Fill everything in and hit Create. Nothing is saved until then, after creating you&apos;ll
        land on the full page to upload photos, videos &amp; bundles.
      </p>
      <CreateCloneForm defaults={defaults} />
    </div>
  );
}
