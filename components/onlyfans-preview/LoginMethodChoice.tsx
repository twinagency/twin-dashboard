"use client";
/** The ways to capture an OnlyFans session, as big choices (openinfloww's pattern): Browser login first and
 * recommended, the Chrome extension as the fallback, a saved session file for the rest. Only the chosen one's
 * panel is shown; the others stay mounted (hidden) so their state survives switching back. */
import type { ReactNode } from "react";
import { FileUp, Globe, Puzzle, type LucideIcon } from "lucide-react";

export type LoginMethod = "browser" | "extension" | "file";

const METHODS: { method: LoginMethod; title: string; sub: string; icon: LucideIcon; tag?: string }[] = [
  { method: "browser", title: "Browser login", icon: Globe, tag: "Recommended",
    sub: "Sign in to OnlyFans in a secure hosted browser. Nothing to install." },
  { method: "extension", title: "Extension", icon: Puzzle,
    sub: "If browser login doesn't work. Sign in on your own Chrome and paste the copied curl." },
  { method: "file", title: "Session file", icon: FileUp,
    sub: "Upload a saved Fastt session capture (.json)." },
];

export default function LoginMethodChoice({ value, onChange, disabled, panels }: {
  value: LoginMethod; onChange: (method: LoginMethod) => void; disabled?: boolean; panels: Record<LoginMethod, ReactNode>;
}) {
  return (
    <div className="min-w-0 space-y-3" data-of-connection-methods>
      <p className="text-xs font-semibold">How do you want to sign in?</p>
      <div role="radiogroup" aria-label="Login method" className="grid grid-cols-1 gap-2">
        {METHODS.map(({ method, title, sub, icon: Icon, tag }) => {
          const on = value === method;
          return (
            <label key={method} data-of-connection-method={method} data-selected={on ? "true" : "false"}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${on ? "border-accent bg-accent/10" : "border-line hover:border-accent"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
              <input type="radio" name="of-login-method" value={method} checked={on} disabled={disabled} onChange={() => onChange(method)} className="sr-only" />
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <Icon className={`h-4 w-4 ${on ? "text-accent" : "text-muted"}`} aria-hidden />
                <span>{title}</span>
                {tag ? <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">{tag}</span> : null}
              </span>
              <span className="text-xs leading-4 text-muted">{sub}</span>
            </label>
          );
        })}
      </div>
      {METHODS.map(({ method }) => (
        <div key={method} hidden={value !== method} data-of-connection-method-panel={method} className="min-w-0 rounded-lg border border-line p-3">
          {panels[method]}
        </div>
      ))}
    </div>
  );
}
