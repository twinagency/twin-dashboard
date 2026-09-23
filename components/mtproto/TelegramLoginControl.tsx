"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  cancelTelegramConnectionAction,
  pollTelegramConnectionAction,
  requestTelegramConnectionAction,
  submitTelegramTwoFactorAction,
} from "@/app/mtproto-campaign/actions";
import type { LoginRequestAction, LoginRequestView } from "@/lib/mtproto/login-control";

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20";

export default function TelegramLoginControl({
  cloneId,
  creatorName,
  connected,
}: {
  cloneId: string;
  creatorName: string;
  connected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState<LoginRequestView | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const terminal = request && ["completed", "failed", "cancelled"].includes(request.status);

  useEffect(() => {
    if (!request || terminal) return;
    const poll = async () => {
      const fd = new FormData();
      fd.set("requestId", request.id);
      try {
        const res = await pollTelegramConnectionAction(fd);
        if (res.ok) {
          setRequest(res.request);
          if (["completed", "failed", "cancelled"].includes(res.request.status)) {
            router.refresh();
            return;
          }
        } else {
          setError(res.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read connection status");
      }
      timer.current = setTimeout(poll, 1000);
    };
    timer.current = setTimeout(poll, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [request?.id, terminal, router]);

  const begin = (action: LoginRequestAction) => {
    setError(null);
    setPassword("");
    const fd = new FormData();
    fd.set("cloneId", cloneId);
    fd.set("action", action);
    startTransition(async () => {
      const res = await requestTelegramConnectionAction(fd);
      if (res.ok) setRequest(res.request);
      else setError(res.error);
      router.refresh();
    });
  };

  const submitPassword = () => {
    if (!request) return;
    const fd = new FormData();
    fd.set("requestId", request.id);
    fd.set("password", password);
    setError(null);
    startTransition(async () => {
      const res = await submitTelegramTwoFactorAction(fd);
      // Remove plaintext from component state as soon as the server action returns.
      setPassword("");
      if (res.ok) setRequest(res.request);
      else setError(res.error);
    });
  };

  const cancel = () => {
    if (!request) return;
    const fd = new FormData();
    fd.set("requestId", request.id);
    startTransition(async () => {
      await cancelTelegramConnectionAction(fd);
      setRequest(null);
      setPassword("");
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={connected ? "outline" : "default"}
          className="h-9 rounded-lg"
          disabled={pending}
          onClick={() => begin(connected ? "reconnect" : "connect")}
        >
          {connected ? "Reconnect Telegram" : "Connect Telegram"}
        </Button>
        {connected && (
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg"
            disabled={pending}
            onClick={() => begin("disconnect")}
          >
            Disconnect
          </Button>
        )}
      </div>

      {error && !request && <p className="mt-2 text-xs text-crit">{error}</p>}

      {request && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label={`Connect ${creatorName} to Telegram`}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Telegram account</p>
                <h2 className="mt-1 font-heading text-xl font-semibold text-ink">
                  {request.action === "disconnect" ? `Disconnect ${creatorName}` : `Connect ${creatorName}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={terminal ? () => setRequest(null) : cancel}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-muted/10 hover:text-ink"
                aria-label={terminal ? "Close" : "Cancel"}
              >
                ×
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-muted/5 p-3 text-sm text-ink">
              {request.message ??
                (request.status === "pending"
                  ? "Waiting for the dedicated MTProto worker..."
                  : request.status === "processing"
                    ? "Preparing Telegram login..."
                    : request.status === "completed"
                      ? "Done."
                      : request.status === "failed"
                        ? "Connection failed."
                        : "Working...")}
            </div>

            {request.status === "qr" && request.qrSvg && (
              <div className="mt-4">
                <div
                  className="mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-xl bg-white p-3"
                  dangerouslySetInnerHTML={{ __html: request.qrSvg }}
                />
                <div className="mt-4 space-y-1 text-sm text-muted">
                  <p className="font-semibold text-ink">On the creator&apos;s phone:</p>
                  <p>Telegram → Settings → Devices → Link Desktop Device</p>
                  <p>Scan the QR above. It refreshes automatically if Telegram rotates it.</p>
                </div>
              </div>
            )}

            {request.status === "password_required" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink">Telegram 2-step verification password</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && password) submitPassword();
                    }}
                    className={inputCls}
                    placeholder="Enter password"
                  />
                  <p className="mt-1 text-xs text-muted">
                    This is encrypted server-side with the worker&apos;s temporary public key before it is stored. The plaintext password is not saved.
                  </p>
                </div>
                <Button type="button" className="w-full" onClick={submitPassword} disabled={pending || !password}>
                  Continue
                </Button>
              </div>
            )}

            {request.status === "completed" && (
              <div className="mt-4">
                <div className="rounded-xl border border-good/30 bg-good/10 p-3 text-sm font-semibold text-good">
                  {request.action === "disconnect" ? "Telegram account disconnected." : "Telegram account connected successfully."}
                </div>
                <Button type="button" className="mt-3 w-full" onClick={() => setRequest(null)}>
                  Done
                </Button>
              </div>
            )}

            {request.status === "failed" && (
              <div className="mt-4">
                <div className="rounded-xl border border-crit/30 bg-crit/10 p-3 text-sm text-crit">
                  {request.message || "Telegram connection failed. No session was saved."}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => setRequest(null)}>
                    Close
                  </Button>
                  <Button type="button" onClick={() => begin(connected ? "reconnect" : "connect")}>
                    Try again
                  </Button>
                </div>
              </div>
            )}

            {!terminal && request.status !== "password_required" && (
              <Button type="button" variant="outline" className="mt-4 w-full" onClick={cancel} disabled={pending}>
                Cancel
              </Button>
            )}

            {error && <p className="mt-3 text-xs text-crit">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
