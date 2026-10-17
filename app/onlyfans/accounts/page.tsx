import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";

// The OnlyFans accounts. One creator can run several; each keeps its own
// connection health, conversations, fans and money.
export default function OnlyFansAccountsPage() {
  return <OnlyFansWorkspace view="accounts" source="server" />;
}
