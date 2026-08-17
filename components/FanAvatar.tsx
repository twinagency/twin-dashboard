"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/colors";

// Real fan profile pic from Telegram (via /api/avatar); if the fan has none or
// privacy-blocks it (404), fall back to an initials circle. No stock images.
export default function FanAvatar({
  cloneId,
  telegramId,
  name,
  color,
  className = "h-6 w-6",
}: {
  cloneId: string;
  telegramId: number | null;
  name: string;
  color?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [cloneId, telegramId]);

  if (failed || telegramId == null) {
    return (
      <span
        // grid + place-items-center, and leading-none so the glyph's own line box
        // cannot push it off the circle's centre (Jesse, 2026-08-17: "the icons
        // are not centred in their circles"). Initials are short and must never
        // wrap, or a two-letter fallback re-centres itself onto two lines.
        className={`grid shrink-0 place-items-center whitespace-nowrap rounded-full text-[10px] font-semibold leading-none text-white ${className}`}
        style={{ background: color ?? "#555" }}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      ref={imageRef}
      src={`/api/avatar?clone=${encodeURIComponent(cloneId)}&tg=${telegramId}`}
      alt=""
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
