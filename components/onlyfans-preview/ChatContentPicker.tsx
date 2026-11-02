"use client";

import { useMemo, useState, type RefObject } from "react";
import { Info, inputCls } from "@/components/clone/fields";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRecordedMoney, type CatalogRead } from "@/lib/onlyfans/workspace";
import type { FanContentHistory } from "@/lib/onlyfans/chat-content-history";
import ChatVaultBrowser from "./ChatVaultBrowser";

export type ChatOffer = CatalogRead["items"][number];
const button = "min-h-9 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50";

/** The same rule the Composer select has always applied. Sale policy is unchanged: only checked terms inside the approved price band can be sent. */
export function isSendableOffer(item: ChatOffer): boolean {
  return item.readiness === "terms_checked" && item.priceCents !== null && item.priceCents >= 300 && item.priceCents <= 20000 && /^[1-9][0-9]*$/.test(item.itemId) && Number(item.itemId) < 2 ** 31;
}
const NOT_SENDABLE = { disabled: "Switched off on the Content page.", free_teaser: "Free teaser, not sold from chat.", needs_review: "Needs review on the Content page.", terms_checked: "Price is outside the approved range." } as const;

/** Media split for an offer, only when both counts are known. */
export function offerMediaSummary(item: ChatOffer): string {
  if (item.mediaCount === null) return "Media count needs review";
  const free = item.previewCount, media = `${item.mediaCount} media`;
  return free === null ? `${media}, free previews need review` : `${media}, ${free} free, ${Math.max(item.mediaCount - free, 0)} paid`;
}

export default function ChatContentPicker({ accountId, offers, offersBusy, offersError, hasMoreOffers, onLoadMoreOffers, selectedItemId, history, contentHref, finalFocus, onSelectOffer, onClose }: {
  accountId: string; offers: ChatOffer[]; offersBusy: boolean; offersError: string; hasMoreOffers: boolean; onLoadMoreOffers: () => void;
  selectedItemId: string; history: FanContentHistory; contentHref: string; finalFocus: RefObject<HTMLElement | null>;
  onSelectOffer: (itemId: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"offers" | "media">("offers"), [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return offers.filter(item => !needle || `${item.label} ${item.description}`.toLowerCase().includes(needle));
  }, [offers, search]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent aria-modal="true" finalFocus={finalFocus} className="flex max-h-[90dvh] flex-col overflow-hidden bg-panel text-ink sm:max-w-3xl" data-of-chat-content-picker>
      <DialogHeader>
        <DialogTitle>Attach content<Info className="ml-1" text="Chat sends one saved offer at its approved catalogue price, with the previews that offer was saved with. Free and paid parts, and the price, are set on the Content page and cannot be changed here." /></DialogTitle>
        <DialogDescription>Choose a saved offer, or browse this creator&apos;s media to inspect it.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Content source">
        {([["offers", "Saved offers"], ["media", "Media library"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value}
          className={`${button} min-h-10 ${tab === value ? "bg-accent text-white" : ""}`} onClick={() => setTab(value)}>{label}</button>)}
      </div>
      <p className="text-xs text-muted" data-of-chat-history-note>
        {history.complete ? "Fan history is complete for the loaded conversation." : `History incomplete. ${history.gaps.join(" ")}`}
        <Info className="ml-1" text="Purchased comes from the fan's recorded purchases. Previously sent and Shared free come from messages already loaded in this chat. No recorded delivery is only shown when that history is complete. Saved offers do not report which media they contain, so history is shown on individual media." />
      </p>
      <div className="min-h-0 overflow-y-auto" data-of-chat-picker-body>
        {tab === "offers" ? <div data-of-chat-offers>
          <label className="block text-xs font-medium text-muted">Search saved offers
            <input type="search" className={`${inputCls} mt-1 w-full`} maxLength={120} value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          {offersError ? <p className="mt-2 text-xs" role="status">{offersError}</p> : null}
          <ul className="mt-3 space-y-2">
            {shown.map(item => {
              const sendable = isSendableOffer(item), chosen = selectedItemId === item.itemId;
              return <li key={item.itemId} className="rounded-xl border border-line p-3" data-of-chat-offer={item.itemId}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-muted">{item.kind}. {offerMediaSummary(item)}</p></div>
                  <p className="text-sm font-semibold">{item.priceCents === null ? "Price needs review" : formatRecordedMoney(item.priceCents, item.currency)}</p>
                </div>
                {item.description ? <p className="mt-1 line-clamp-2 break-words text-xs text-muted">{item.description}</p> : null}
                {sendable ? <button type="button" className={`${button} mt-2`} aria-pressed={chosen} onClick={() => { onSelectOffer(item.itemId); onClose(); }}>{chosen ? "Selected" : "Select offer"}</button>
                  : <p className="mt-2 text-xs text-muted" data-of-chat-offer-blocked>Not available in chat. {NOT_SENDABLE[item.readiness]}</p>}
              </li>;
            })}
          </ul>
          {!shown.length && !offersBusy ? <p className="mt-3 text-sm">{offers.length ? "No saved offers match this search." : "No saved offers yet. Create one on the Content page."}</p> : null}
          {hasMoreOffers || offersError ? <button type="button" className={`${button} mt-3`} disabled={offersBusy} onClick={onLoadMoreOffers}>{offersBusy ? "Loading…" : hasMoreOffers ? "Load more saved offers" : "Retry saved offers"}</button> : null}
        </div> : <ChatVaultBrowser key={accountId} accountId={accountId} history={history} contentHref={contentHref} />}
      </div>
      <div className="flex shrink-0 justify-end border-t border-line pt-3"><button type="button" className={button} onClick={onClose}>Close</button></div>
    </DialogContent>
  </Dialog>;
}
