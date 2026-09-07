"use client";
import { useState, type FormEvent } from "react";

export default function LynqPasswordForm() {
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(pending)return;
    const form=event.currentTarget;
    const body=new FormData(form);
    setPending(true);setError("");
    try {
      const response=await fetch("/agency-admin/lynq-password/update",{method:"POST",body,credentials:"same-origin",headers:{Accept:"application/json"}});
      if(!response.ok){setError("Unable to update the password. Check that you are signed in as admin and try again.");return;}
      form.reset();setDone(true);
    }catch{setError("The request couldn’t finish. Please try again.");}
    finally{setPending(false);}
  }
  if(done)return <div role="status" className="space-y-4"><p>LYNQ password updated.</p><a href="/lynq" className="inline-block rounded-lg bg-accent px-4 py-3 font-semibold text-white">Open LYNQ sign-in</a></div>;
  return <form onSubmit={submit} className="space-y-5 rounded-xl border border-line bg-white p-6">
    {error&&<p role="alert" className="text-sm text-crit">{error}</p>}
    <label className="block text-sm font-medium">New LYNQ password (16 characters minimum)
      <input name="password" type="password" autoComplete="new-password" required minLength={16} maxLength={256} disabled={pending} className="mt-2 w-full rounded-lg border border-line p-3"/>
    </label>
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent p-3 font-semibold text-white disabled:opacity-60">{pending?"Updating…":"Set LYNQ password"}</button>
  </form>;
}
