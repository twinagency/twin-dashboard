import NativeWorkspace, { type NativeSearch } from "@/components/onlyfans-preview/NativeWorkspace";
export const dynamic = "force-dynamic";
export default function ContentPage({ searchParams }: { searchParams: Promise<NativeSearch> }) {
  return <NativeWorkspace section="content" searchParams={searchParams} />;
}
