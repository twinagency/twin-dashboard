"use client";

import CurrencyToggle from "./CurrencyToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Day-mode only — this used to also hold a light/dark ThemeToggle, but the
// admin no longer offers a dark mode (matching allieai2), so it's just the
// currency picker now.
export default function DisplayPrefs() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Display preferences"
            className="flex items-center justify-center rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="flex w-auto flex-col gap-2 p-2.5">
        <div>
          <div className="mb-1 px-0.5 text-[10px] font-medium text-muted">Currency</div>
          <CurrencyToggle />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
