import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";

// The OnlyFans inbox. It shares the dashboard's Fans-screen geometry (three
// `users-panel` columns) because it is the same job: pick an account, read the
// thread, act on the fan. The channel gate is the segment layout above.
export default function OnlyFansInboxPage() {
  // `source="server"` reads the dashboard's own /api/onlyfans handlers. With no
  // backend configured in this environment that surfaces an explicit
  // `unavailable` state — never sample data.
  return <OnlyFansWorkspace view="inbox" source="server" />;
}
