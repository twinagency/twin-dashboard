import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";

// The OnlyFans inbox. It shares the dashboard's Fans-screen geometry (three
// `users-panel` columns) because it is the same job: pick an account, read the
// thread, act on the fan.
export default function OnlyFansInboxPage() {
  return <OnlyFansWorkspace view="inbox" source="fixture" />;
}
