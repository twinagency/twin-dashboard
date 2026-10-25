"use client";

import type { MessageAttachments as Attachments } from "@/lib/onlyfans-preview/types";
import { attachmentPurchaseLabel } from "@/lib/onlyfans/message-attachments";
import VaultAssetPreview from "./VaultAssetPreview";
import { formatMoney } from "./labels";

export default function MessageAttachments({ attachments, accountId }: { attachments?: Attachments; accountId: string }) {
  if (!attachments || (attachments.count === 0 && attachments.price.minorUnits === 0)) return null;
  const paid = attachments.price.minorUnits > 0;
  return <div data-of-message-media className="mb-2 space-y-2 rounded-lg border border-current/20 bg-black/5 p-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
      <span>{paid ? "Paid content" : "Media"}</span>
      <span data-of-message-price>{paid ? formatMoney(attachments.price) : "Free"}</span>
    </div>
    <p className="text-xs" data-of-message-purchase>{attachments.count > 0 ? `${attachments.count} attachment${attachments.count === 1 ? "" : "s"} · ` : ""}{attachmentPurchaseLabel(attachments.purchaseStatus)}</p>
    <div className="flex flex-wrap gap-2">
      {attachments.media.map(item => item.kind === "photo" || item.kind === "video"
        ? <VaultAssetPreview key={item.mediaId} accountId={accountId} mediaId={item.mediaId} kind={item.kind} readOnly />
        : <span key={item.mediaId} className="rounded border border-current/20 p-2 text-xs">{item.kind === "audio" ? "Audio" : "Attachment"} #{item.mediaId}</span>)}
    </div>
    {attachments.count > attachments.media.length ? <p className="text-xs">Some attachment previews are unavailable.</p> : null}
  </div>;
}
