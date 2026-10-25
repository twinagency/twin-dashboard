import NativeWorkspace, { type NativeSearch } from "@/components/onlyfans-preview/NativeWorkspace";
export const dynamic = "force-dynamic";
export default function SettingsPage({ searchParams }: { searchParams: Promise<NativeSearch> }) {
  return <NativeWorkspace section="settings" searchParams={searchParams} />;
}
