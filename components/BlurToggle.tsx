"use client";

import { useBlur } from "./BlurProvider";

// Compact top-bar button, same visual language as the other icon buttons in
// TopBar.tsx — eye vs eye-off, click flips it. Blurs every image/video in
// the dashboard via a single CSS rule keyed off a class on <html>.
export default function BlurToggle() {
  const { blurred, setBlurred } = useBlur();
  return (
    <button
      type="button"
      onClick={() => setBlurred(!blurred)}
      title={blurred ? "Media blurred - click to unblur" : "Blur all media"}
      aria-pressed={blurred}
      className={
        "flex items-center justify-center rounded-full p-2 transition hover:bg-muted/10 " +
        (blurred ? "text-accent" : "text-muted hover:text-ink")
      }
    >
      {blurred ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
