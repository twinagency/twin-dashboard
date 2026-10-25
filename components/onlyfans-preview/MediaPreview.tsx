"use client";
import {useState,useEffect} from "react";
export function MediaPreview({ src, video = false, expanded = false, failed = false, pending = false, alt = "Creator content preview" }: {
  src?: string | null; video?: boolean; expanded?: boolean; failed?: boolean; pending?: boolean; alt?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const classes = expanded ? "max-h-[60vh] w-full rounded-lg object-contain" : "aspect-square w-full object-cover transition group-hover:scale-[1.02]";
  if (!src || failed || broken) return <div className="grid aspect-square w-full place-items-center bg-elev p-1 text-center text-xs text-muted">{failed || broken ? "Preview unavailable" : pending ? "Loading preview…" : "No preview"}</div>;
  return video ? <video src={src} className={classes} controls={expanded} muted={!expanded} playsInline preload="metadata" onError={() => setBroken(true)} /> : <img src={src} alt={alt} loading="lazy" className={classes} onError={() => setBroken(true)} />;
}
