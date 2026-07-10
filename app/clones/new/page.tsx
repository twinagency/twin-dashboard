import Link from "next/link";
import CreateCloneForm from "@/components/CreateCloneForm";

export default function NewClonePage() {
  return (
    <div>
      <Link href="/clones" className="text-sm text-gray-400 dark:text-neutral-500 hover:text-gray-900 dark:hover:text-neutral-100">
        ← Back
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">New clone</h1>
      <p className="mb-6 text-sm text-gray-400 dark:text-neutral-500">
        Fill everything in and hit Create. Nothing is saved until then — after creating you&apos;ll
        land on the full page to upload photos, videos &amp; bundles.
      </p>
      <CreateCloneForm />
    </div>
  );
}
