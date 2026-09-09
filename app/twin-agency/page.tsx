import type { Metadata } from "next";
import MarketingSite from "./MarketingSite";

export const metadata: Metadata = {
  title: "Twin Agency | Your audience. Your AI twin.",
  description: "Let your AI twin handle the conversations. Personalised fan chats, paid content and optional voice replies, with you in control.",
  robots: { index: false, follow: false },
};

// Phase-one preview. No account creation, tenant resolution or database reads.
export default function TwinAgencyPage() {
  return <MarketingSite />;
}
