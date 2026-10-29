"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { avatarFailureKey, resolveAvatarSource } from "@/lib/onlyfans-preview/avatar";

/** Shared creator identity image. Missing photos use a neutral profile icon. */
export default function CreatorAvatar({ name, photoUrl, providerPhotoUrl, avatarId = "", className = "h-10 w-10" }: {
  name: string; photoUrl?: string | null; providerPhotoUrl?: string | null; avatarId?: string; className?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const image = useRef<HTMLImageElement>(null);
  const source = resolveAvatarSource({ id: avatarId, providerUrl: providerPhotoUrl, portraitUrl: photoUrl, failed });
  const url = source.kind === "initials" ? null : source.url;
  const markFailed = (value: string) => setFailed(current => current.includes(avatarFailureKey(avatarId, value)) ? current : [...current, avatarFailureKey(avatarId, value)]);
  useEffect(() => {
    if (url && image.current?.complete && image.current.naturalWidth === 0) markFailed(url);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={`creator-name creator-avatar inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400 ${className}`}>
    {url
      ? <img key={avatarFailureKey(avatarId, url)} ref={image} src={url} alt={name} referrerPolicy={source.kind === "provider" ? "no-referrer" : undefined} onError={() => markFailed(url)} className="h-full w-full object-cover" style={{ objectPosition: "50% 30%" }} />
      : <UserRound aria-label={`${name}, profile photo unavailable`} className="h-3/5 w-3/5" />}
  </span>;
}
