"use client";

import { useTheme } from "./ThemeProvider";

type Theme = "light" | "dark";

const ICONS: Record<Theme, React.ReactNode> = {
  light: (
    // Sun
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  dark: (
    // Moon
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-neutral-800">
      {(["light", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          aria-label={`${t} mode`}
          aria-pressed={theme === t}
          className={
            "rounded-md p-1.5 transition " +
            (theme === t
              ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
              : "text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white")
          }
        >
          {ICONS[t]}
        </button>
      ))}
    </div>
  );
}
