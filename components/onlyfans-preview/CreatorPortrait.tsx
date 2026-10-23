"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
export type PortraitCreator = { id: string; name: string; photoUrl?: string };
const PortraitContext = createContext<PortraitCreator[]>([]);
export function OnlyFansPortraitProvider({ creators, children }: { creators: PortraitCreator[]; children: ReactNode }) {
  return <PortraitContext.Provider value={creators}>{children}</PortraitContext.Provider>;
}
export default function CreatorPortrait({ creatorId, name, large = false }: { creatorId: string; name: string; large?: boolean }) {
  const photo = useContext(PortraitContext).find(creator => creator.id === creatorId)?.photoUrl;
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return <span className={`of-portrait${large ? " of-portrait-large" : ""}`} aria-hidden="true">
    {photo && failedPhoto !== photo ? <img src={photo} alt="" onError={() => setFailedPhoto(photo)} /> : <span>{name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "OF"}</span>}
  </span>;
}
