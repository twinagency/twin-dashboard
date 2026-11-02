import { Info } from "@/components/clone/fields";
import MtprotoNav from "@/components/mtproto/MtprotoNav";

// Global live arm and global stop live on the Settings tab, not in this shell.
export default function MtprotoCampaignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-page pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
          MTProto Campaign
          <Info text="Win back silent fans by messaging them from each creator's own Telegram account. Nothing here sends by itself: a person starts every run, and going live needs a typed confirmation." />
        </h1>
        <MtprotoNav />
      </div>
      {children}
    </div>
  );
}
