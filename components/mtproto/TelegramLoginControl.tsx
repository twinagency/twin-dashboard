"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";
import {
  cancelTelegramConnectionAction,
  pollTelegramConnectionAction,
  requestTelegramConnectionAction,
  submitTelegramCodeAction,
  submitTelegramTwoFactorAction,
} from "@/app/mtproto-campaign/actions";
import type { LoginRequestView } from "@/lib/mtproto/login-control";

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20";

type Method = "qr" | "phone";

export default function TelegramLoginControl({
  cloneId,
  creatorName,
  connected,
  initialRequest = null,
  initialPhone = null,
}: {
  cloneId: string;
  creatorName: string;
  connected: boolean;
  initialRequest?: LoginRequestView | null;
  /** clones.account_phone, prefilled into the phone login field. Editable. */
  initialPhone?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState<LoginRequestView | null>(initialRequest);
  const [method, setMethod] = useState<Method>("qr");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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

  const begin = (kind: "connect" | "disconnect") => {
    setError(null);
    setPassword("");
    setCode("");
    const fd = new FormData();
    fd.set("cloneId", cloneId);
    if (kind === "disconnect") {
      fd.set("action", "disconnect");
    } else if (method === "phone") {
      fd.set("action", connected ? "reconnect_phone" : "connect_phone");
      fd.set("phone", phone);
    } else {
      fd.set("action", connected ? "reconnect" : "connect");
    }
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

  const submitCode = () => {
    if (!request) return;
    const fd = new FormData();
    fd.set("requestId", request.id);
    fd.set("code", code);
    setError(null);
    startTransition(async () => {
      const res = await submitTelegramCodeAction(fd);
      // Remove plaintext from component state as soon as the server action returns.
      setCode("");
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
      setCode("");
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={() => setMethod("qr")}
            className={`rounded-md px-2 py-1 font-medium transition ${method === "qr" ? "bg-accent-2/15 text-ink" : "text-muted hover:text-ink"}`}
          >
            QR code
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setMethod("phone")}
            className={`rounded-md px-2 py-1 font-medium transition ${method === "phone" ? "bg-accent-2/15 text-ink" : "text-muted hover:text-ink"}`}
          >
            Phone number
          </button>
        </div>

        {method === "phone" && (
          <div className="flex items-center gap-1">
            <input
              type="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`${inputCls} h-9 w-40`}
              placeholder="+15551234567"
              disabled={pending}
            />
            <Info text="Telegram sends a login code to this number. A code login is not approved by another device, so it stays connected even if the phone that scanned a QR code later logs out." />
          </div>
        )}

        <Button
          type="button"
          variant={connected ? "outline" : "default"}
          className="h-9 rounded-lg"
          disabled={pending || (method === "phone" && !phone.trim())}
          onClick={() => begin("connect")}
        >
          {connected ? "Reconnect Telegram" : "Connect Telegram"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg"
          disabled={pending}
          onClick={() => begin("disconnect")}
        >
          {connected ? "Disconnect" : "Clear connection"}
        </Button>
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
                    : request.status === "code_required"
                      ? "Enter the code Telegram sent."
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
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-ink">
                    Telegram 2-step verification password
                    <Info text="Encrypted server-side with the worker's temporary public key before it is stored. The plaintext password is not saved." />
                  </label>
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
                </div>
                <Button type="button" className="w-full" onClick={submitPassword} disabled={pending || !password}>
                  Continue
                </Button>
              </div>
            )}

            {request.status === "code_required" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-ink">
                    Telegram login code
                    <Info text="Encrypted server-side with the worker's temporary public key before it is stored, the same way the 2-step verification password is. The plaintext code is not saved." />
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && code) submitCode();
                    }}
                    className={inputCls}
                    placeholder="Enter code"
                  />
                </div>
                <Button type="button" className="w-full" onClick={submitCode} disabled={pending || !code}>
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
                  <Button type="button" onClick={() => begin("connect")}>
                    Try again
                  </Button>
                </div>
              </div>
            )}

            {!terminal && request.status !== "password_required" && request.status !== "code_required" && (
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
