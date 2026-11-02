"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { avatarFailureKey, initialsFor, resolveAvatarSource } from "@/lib/onlyfans-preview/avatar";
export type PortraitCreator = { id: string; name: string; photoUrl?: string };
const PortraitContext = createContext<PortraitCreator[]>([]);
export function OnlyFansPortraitProvider({ creators, children }: { creators: PortraitCreator[]; children: ReactNode }) {
  return <PortraitContext.Provider value={creators}>{children}</PortraitContext.Provider>;
}
export default function CreatorPortrait({ creatorId, name, large = false, providerAvatarUrl }: { creatorId: string; name: string; large?: boolean; providerAvatarUrl?: string | null }) {
  const portraitUrl = useContext(PortraitContext).find(creator => creator.id === creatorId)?.photoUrl;
  const [failed, setFailed] = useState<string[]>([]);
  const image = useRef<HTMLImageElement>(null);
  const source = resolveAvatarSource({ id: creatorId, providerUrl: providerAvatarUrl, portraitUrl, failed });
  const markFailed = (url: string) => setFailed(current => current.includes(avatarFailureKey(creatorId, url)) ? current : [...current, avatarFailureKey(creatorId, url)]);
  const sourceUrl = source.kind === "initials" ? null : source.url;
  // An image can fail before hydration attaches onError.
  useEffect(() => {
    if (sourceUrl && image.current?.complete && image.current.naturalWidth === 0) markFailed(sourceUrl);
  }, [sourceUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={`of-portrait${large ? " of-portrait-large" : ""}`} aria-hidden="true">
    {source.kind === "initials" ? <span>{initialsFor(name)}</span>
      : <img key={avatarFailureKey(creatorId, source.url)} ref={image} src={source.url} alt="" referrerPolicy={source.kind === "provider" ? "no-referrer" : undefined} onError={() => markFailed(source.url)} />}
  </span>;
}
