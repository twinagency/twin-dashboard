"use client";
import { useState } from "react";
import { avatarFailureKey, initialsFor, isVerifiedProviderAvatar } from "@/lib/onlyfans-preview/avatar";
export default function OnlyFansAvatar({ name, avatarUrl, className = "h-9 w-9", id = "" }: { name: string; avatarUrl?: string | null; className?: string; id?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const key = isVerifiedProviderAvatar(avatarUrl) ? avatarFailureKey(id, avatarUrl) : null;
  return key && avatarUrl && key !== failed ? <img key={key} src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(key)} className={`shrink-0 rounded-full object-cover ${className}`} /> : <span className={`grid shrink-0 place-items-center rounded-full bg-elev text-xs font-semibold ${className}`}>{initialsFor(name)}</span>;
}
