import type { Metadata } from "next";
import MarketingSite from "./MarketingSite";
import "./live.css";

export const metadata: Metadata = {
  title: "Twin - Your AI voice twin that never sleeps",
  description: "Twin clones your voice into an AI version that chats with fans 24/7 via written and voice messages.",
  robots: { index: false, follow: false },
};

// Phase one mirrors the live Twin Agency homepage. Creator auth stays deferred.
export default function TwinAgencyPage() {
  return <MarketingSite />;
}
