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

// Global "blur all media" privacy toggle — persisted like theme/currency.
// Applies a class on <html> that a single CSS rule (globals.css) uses to
// blur every img/video in the app, so no individual media component needs
// to know this exists.
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
