"use client";
import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/colors";
import { DEMO_CLONE_ID } from "@/lib/creator-demo-policy";
export default function FanAvatar({ cloneId, telegramId, name, color, className = "h-6 w-6" }: { cloneId: string; telegramId: number | null; name: string; color?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => { const image = imageRef.current; if (image?.complete && image.naturalWidth === 0) setFailed(true); }, [cloneId, telegramId]);
  // Synthetic people have no Telegram identity. Never query a live API for them.
  if (failed || telegramId == null || cloneId === DEMO_CLONE_ID) return <span className={`grid shrink-0 place-items-center whitespace-nowrap rounded-full text-[10px] font-semibold leading-none text-white ${className}`} style={{ background: color ?? "#555" }}>{initials(name)}</span>;
  return <img ref={imageRef} src={`/api/avatar?clone=${encodeURIComponent(cloneId)}&tg=${telegramId}`} alt="" onLoad={event => { if (event.currentTarget.naturalWidth === 0) setFailed(true); }} onError={() => setFailed(true)} className={`shrink-0 rounded-full object-cover ${className}`} />;
}
