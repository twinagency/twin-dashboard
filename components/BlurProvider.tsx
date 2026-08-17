"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Ctx = {
  blurred: boolean;
  setBlurred: (b: boolean) => void;
};

const BlurContext = createContext<Ctx>({
  blurred: false,
  setBlurred: () => {},
});

export function useBlur() {
  return useContext(BlurContext);
}

function applyBlur(b: boolean) {
  document.documentElement.classList.toggle("blur-media", b);
}

// Global privacy toggle — persisted like theme/currency. Applies a class on
// <html> that CSS rules in globals.css key off, so no individual component
// needs to know this exists: `img`/`video` blur, and anything carrying
// `.creator-name` blurs too (Jesse, 2026-08-17 — hiding the creator's photo
// but leaving her name in the breadcrumb was not actually hiding her).
//
// It is deliberately GLOBAL, not per creator. This provider is mounted once in
// app/layout.tsx, which does NOT re-render on client-side navigation, so the
// state survives page changes and clone switches on its own. Only the eye
// button clears it.
//
// THE OTHER HALF LIVES IN app/layout.tsx: an inline script sets the class
// before first paint, because the useEffect below only runs after hydration
// and a hard reload flashed everything unblurred until it did. Removing either
// half reintroduces that flash.
export default function BlurProvider({ children }: { children: React.ReactNode }) {
  const [blurred, setBlurredState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("blurMedia");
    const next = saved === "true";
    setBlurredState(next);
    applyBlur(next);
  }, []);

  function setBlurred(b: boolean) {
    setBlurredState(b);
    localStorage.setItem("blurMedia", String(b));
    applyBlur(b);
  }

  return <BlurContext.Provider value={{ blurred, setBlurred }}>{children}</BlurContext.Provider>;
}
