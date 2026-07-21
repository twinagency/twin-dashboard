"use client";

import { useState } from "react";
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
  if (failed || telegramId == null) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${className}`}
        style={{ background: color ?? "#555" }}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={`/api/avatar?clone=${encodeURIComponent(cloneId)}&tg=${telegramId}`}
      alt=""
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
