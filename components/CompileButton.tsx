"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CompileButton({ cloneId }: { cloneId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setState("running");
    setMsg("");
    try {
      const res = await fetch(`/api/compile?id=${cloneId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "compile failed");
      setState("done");
      setMsg("Prompts compiled — reloading…");
      setTimeout(() => router.refresh(), 800);
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "unknown error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={state === "running"}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium transition hover:bg-brand-light disabled:opacity-50"
      >
        {state === "running" ? "Compiling…" : "Compile prompts"}
      </button>
      {msg && (
        <span className={`text-sm ${state === "error" ? "text-red-400" : "text-green-400"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
