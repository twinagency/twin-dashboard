"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import HostedConnect from "@/components/creator-platforms/HostedConnect";
import { parseCreatorPlatforms, platformConnectionState, type CreatorPlatforms } from "@/lib/creator-platforms/model";

const endpoint = "/creator-auth/platforms";
export default function CreatorOnlyFansOnboarding({ readOnly }: { readOnly: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<CreatorPlatforms | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const alive = useRef(false), running = useRef(false), enrollment = useRef<string | null>(null), navigated = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function read() {
    const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    const next = parseCreatorPlatforms(await response.json().catch(() => null));
    if (!response.ok || !next) throw new Error(response.status === 401 ? "Sign in to your creator account again." : "Your connection could not be checked. Please try again.");
    return next;
  }
  async function changed(id?: string | null) {
    if (id) enrollment.current = id;
    try {
      const next = await read();
      if (!alive.current) return false;
      setData(next);
      const request = next.onlyfans.enrollments.find(row => row.id === enrollment.current);
      const account = next.onlyfans.accounts.find(row => row.id === request?.accountId);
      if (request?.status === "accepted" && account && platformConnectionState(account) === "connected") {
        if (!navigated.current) { navigated.current = true; router.replace("/creator?setup=onlyfans"); router.refresh(); }
        return true;
      }
      if (request && ["failed", "expired"].includes(request.status)) { setNotice("Your account could not be verified. Please try signing in again."); return false; }
      if (id) setNotice("Checking your account. You'll go to your dashboard as soon as the connection is confirmed.");
      return false;
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : "Your connection could not be checked."); return false; }
  }
  async function start() {
    if (running.current || readOnly) return;
    running.current = true; setBusy(true); setNotice("");
    try {
      let next = await read();
      if (next.readOnly) throw new Error("This creator account is read-only.");
      if (!next.profileId || !next.requested.includes("onlyfans")) {
        const channels = (["telegram", "onlyfans"] as const).filter(channel => channel === "onlyfans" || next.requested.includes(channel) || next.telegram.configured);
        const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels }), signal: AbortSignal.timeout(20000) });
        const saved = parseCreatorPlatforms(await response.json().catch(() => null));
        if (!response.ok || !saved?.profileId) throw new Error("Your setup could not be saved. Please try again.");
        next = saved;
      }
      if (next.onlyfans.status !== "ready" || next.onlyfans.signIn !== "hosted") throw new Error("OnlyFans sign-in is temporarily unavailable. Please try again shortly.");
      if (alive.current) { setData(next); setStarted(true); }
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : "Sign-in could not be opened."); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => { if (!readOnly) void start(); }, [readOnly]);
  return <section data-creator-setup-panel data-onboarding-onlyfans>
    <Link href="/creator/onboarding" className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm text-muted"><ArrowLeft size={16} />Back to setup options</Link>
    <h1 data-setup-heading>Sign in with OnlyFans.</h1>
    <p className="mb-7 max-w-xl text-sm leading-7 text-muted">Connect your account to import your media and help us learn your personality. Once connected, we'll take you to your dashboard while setup continues.</p>
    {readOnly ? <p role="status">Connections cannot be changed in this read-only view.</p> : started && data?.profileId ? <HostedConnect profileId={data.profileId} accountId={null} disabled={false} onChanged={changed} /> : busy ? <p role="status" className="flex items-center gap-2 py-8"><LoaderCircle className="animate-spin" size={19} />Preparing your sign-in...</p> : <button type="button" onClick={() => void start()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"><RefreshCw size={16} />Try again</button>}
    {notice && <p role="status" className="my-5 rounded-xl border border-border p-4 text-sm leading-6">{notice}</p>}
    <Link href="/creator/onboarding?step=content" className="mt-8 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Continue manually instead</Link>
  </section>;
}
