import NativeWorkspace, { type NativeSearch } from "@/components/onlyfans-preview/NativeWorkspace";
export const dynamic = "force-dynamic";
export default function SalesPage({ searchParams }: { searchParams: Promise<NativeSearch> }) {
  return <NativeWorkspace section="sales" searchParams={searchParams} />;
}
