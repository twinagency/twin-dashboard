"use client";

import { useEffect } from "react";

export default function AccountLinkBridge() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = (button.textContent || "").trim().toLowerCase();
      if (label === "sign up") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.location.assign("/creator/signup");
      } else if (label === "sign in") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.location.assign("/creator/login");
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}
