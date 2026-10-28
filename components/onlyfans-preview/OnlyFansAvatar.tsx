"use client";
import { useState } from "react";
export default function OnlyFansAvatar({ name, avatarUrl, className = "h-9 w-9" }: { name: string; avatarUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  let safe = false;
  try { const u = new URL(avatarUrl ?? ""); safe = u.protocol === "https:" && !u.username && !u.password && !u.port && ["onlyfans.com", "ofusercontent.com", "onlyfansusercontent.com"].some(domain => u.hostname === domain || u.hostname.endsWith("." + domain)); } catch { /* Fall back to initials. */ }
  return safe && avatarUrl !== failed ? <img src={avatarUrl!} alt="" referrerPolicy="no-referrer" onError={() => setFailed(avatarUrl!)} className={`shrink-0 rounded-full object-cover ${className}`} /> : <span className={`grid shrink-0 place-items-center rounded-full bg-elev text-xs font-semibold ${className}`}>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "OF"}</span>;
}
