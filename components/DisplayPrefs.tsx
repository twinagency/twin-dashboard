"use client";

import { useTheme } from "./ThemeProvider";
import CurrencyToggle from "./CurrencyToggle";
import ThemeToggle from "./ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Currency + light/dark used to be two separate segmented controls sitting
// side by side in the nav pill — collapsed into one icon button (shows the
// active theme) that opens both on click, to save room in the pill.
export default function DisplayPrefs() {
  const { theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Display preferences"
            className="flex items-center justify-center rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"
          >
            {theme === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            )}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="flex w-auto flex-col gap-2 p-2.5">
        <div>
          <div className="mb-1 px-0.5 text-[10px] font-medium text-muted">Currency</div>
          <CurrencyToggle />
        </div>
        <div>
          <div className="mb-1 px-0.5 text-[10px] font-medium text-muted">Theme</div>
          <ThemeToggle />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
