import { requireChannel } from "@/lib/channel-scope";

// Every OnlyFans route belongs to the OnlyFans channel, and this segment is
// where that is declared.
//
// The gate lives here rather than in each page so a new OnlyFans screen cannot
// be added without inheriting it: the segment refuses before any child renders,
// and the four pages below never have to remember. `requireChannel` is the
// server's own answer — it reads middleware's `x-pathname` and the verified
// identity, not the browser's idea of where it is.
//
// What is behind the gate today is the OF-D0 fixture surface: synthetic
// accounts and conversations, labelled as sample data on every screen, with
// every control simulated. No backend, account, session or send exists. The
// gate is about who may open the workspace, not about what it can reach.
export default async function OnlyFansChannelLayout({ children }: { children: React.ReactNode }) {
  await requireChannel("onlyfans");
  return children;
}
