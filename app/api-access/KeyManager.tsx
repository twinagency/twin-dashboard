"use client";

import { useActionState, useState } from "react";
import { issueKeyAction, revokeKeyAction, type IssueState } from "./actions";
import type { ApiKeyRow } from "@/lib/api-keys-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info, Warning, inputCls, selectCls } from "@/components/clone/fields";

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// The one-time reveal. This is the only moment the key exists outside the
// caller's hands, so it is deliberately loud and deliberately not dismissible
// by accident: only its own Done button clears it.
function KeyReveal({ apiKey, onDone }: { apiKey: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-good/40 bg-good/10 p-4">
      <p className="text-sm font-semibold text-ink">Key created. Copy it now.</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Only a hash of this key is stored, so it cannot be shown again or recovered. If it is lost, revoke it and
        issue another.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[12px] text-ink">
          {apiKey}
        </code>
        <Button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(apiKey).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function KeyManager({
  clones,
  keys,
}: {
  clones: { id: string; slug: string; name: string }[];
  keys: ApiKeyRow[];
}) {
  const [state, formAction, pending] = useActionState<IssueState, FormData>(issueKeyAction, {});
  const [dismissed, setDismissed] = useState(false);
  const showKey = state.key && !dismissed;

  return (
    <div className="space-y-5">
      <Warning
        text="A key gives whoever holds it read access to that model's revenue and fan list, from anywhere on the internet."
        detail="It cannot see any other model, any chat message, any prompt, or our AI costs. It is read-only and can be revoked at any time, which takes effect on the very next request. Send it over something private, not in a group chat."
      />

      {showKey && <KeyReveal apiKey={state.key!} onDone={() => setDismissed(true)} />}

      <form
        action={(fd) => {
          setDismissed(false);
          formAction(fd);
        }}
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end"
      >
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-sm text-muted">
            Model
            <Info text="A key is scoped to exactly one model. There is no key that can see two." />
          </span>
          <select name="clone_id" className={selectCls} required defaultValue={clones[0]?.id ?? ""}>
            {clones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-sm text-muted">
            Label
            <Info text="What this key is for, so it can be told apart later. The key itself is never shown again, so the label is the only way to know which is which." />
          </span>
          <Input name="label" className={inputCls} placeholder="e.g. Kait's revenue dashboard" required />
        </label>

        <Button type="submit" disabled={pending || clones.length === 0}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>

      {state.error && <p className="text-sm text-crit">{state.error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Key</th>
              <th className="py-2 pr-3 font-medium">Model</th>
              <th className="py-2 pr-3 font-medium">Label</th>
              <th className="py-2 pr-3 font-medium">Created</th>
              <th className="py-2 pr-3 font-medium">Last used</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted">
                  No keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-line/60">
                <td className="py-2 pr-3 font-mono text-[12px] text-ink">{k.prefix}…</td>
                <td className="creator-name py-2 pr-3 text-ink">{k.cloneName ?? k.cloneSlug ?? "?"}</td>
                <td className="py-2 pr-3 text-ink">{k.label}</td>
                <td className="py-2 pr-3 text-muted">{when(k.createdAt)}</td>
                {/* "never" on a live key is worth seeing: it means whoever it
                    was issued to has not wired it up yet. */}
                <td className="py-2 pr-3 text-muted">{when(k.lastUsedAt)}</td>
                <td className="py-2 pr-3">
                  {k.revokedAt ? (
                    <span className="text-muted">Revoked {when(k.revokedAt)}</span>
                  ) : (
                    <span className="text-good">Live</span>
                  )}
                </td>
                <td className="py-2">
                  {!k.revokedAt && (
                    <form action={revokeKeyAction}>
                      <input type="hidden" name="key_id" value={k.id} />
                      <input type="hidden" name="key_prefix" value={k.prefix} />
                      <Button
                        type="submit"
                        variant="outline"
                        className="text-crit"
                        // No confirm dialog on purpose: revoking is the SAFE
                        // direction and is instantly redoable by issuing a new
                        // key. A confirm here would train people to click
                        // through the ones that matter.
                      >
                        Revoke
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
