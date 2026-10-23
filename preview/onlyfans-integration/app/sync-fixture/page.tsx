"use client";
// Synthetic fixture for the offer import and content sync browser checks. Every request is answered by the check's own route mocks.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import OfferImportPanel from "@/components/onlyfans-preview/OfferImportPanel";
import ContentSyncSave from "@/components/onlyfans-preview/ContentSyncSave";

function Fixture() {
  const query = useSearchParams(), accountId = query.get("account") ?? "acc-a", readOnly = query.get("readonly") === "1";
  return <main className="mx-auto max-w-4xl p-3"><h1 className="mb-4 text-2xl font-semibold">Content sync fixture</h1>
    <ContentSyncSave key={`save:${accountId}`} accountId={accountId} readOnly={readOnly} />
    <OfferImportPanel key={`import:${accountId}`} accountId={accountId} readOnly={readOnly} /></main>;
}
export default function Page() { return <Suspense><Fixture /></Suspense>; }
