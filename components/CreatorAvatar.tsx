"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";

/** Shared creator identity image. Missing photos use a neutral profile icon. */
export default function CreatorAvatar({ name, photoUrl, className = "h-10 w-10" }: {
  name: string; photoUrl?: string | null; className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0 && photoUrl) setFailedUrl(photoUrl);
  }, [photoUrl]);
  return <span className={`creator-name creator-avatar inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400 ${className}`}>
    {photoUrl && photoUrl !== failedUrl
      ? <img ref={image} src={photoUrl} alt={name} onError={() => setFailedUrl(photoUrl)} className="h-full w-full object-cover" style={{ objectPosition: "50% 30%" }} />
      : <UserRound aria-label={`${name}, profile photo unavailable`} className="h-3/5 w-3/5" />}
  </span>;
}
