"use client";
import {useEffect,useState} from "react";
export default function AgencyJoin({code,agency}:{code:string;agency:string}) {
  const [session,setSession]=useState<{access:string;refresh:string}|null>(null), [error,setError]=useState("");
  useEffect(()=>{
    const params=new URLSearchParams(window.location.hash.slice(1));
    const access=params.get("access_token"),refresh=params.get("refresh_token");
    if(access&&refresh)setSession({access,refresh});
    if(params.has("error_description"))setError("The verification link expired or could not be used. Request a fresh invitation from your agency owner.");
    if(window.location.hash)window.history.replaceState(null,"",window.location.pathname+window.location.search);
  },[]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Join {agency}</h1><p className="text-sm text-muted">Your creator assignments and permissions are already selected. Accept once to enter your workspace.</p>{error&&<p role="alert">{error}</p>}
    {session?<form action="/agency/join/accept" method="post" className="twin-team-form space-y-4"><input type="hidden" name="code" value={code}/><input type="hidden" name="access_token" value={session.access}/><input type="hidden" name="refresh_token" value={session.refresh}/><label>Create your password<input name="password" type="password" minLength={16} maxLength={256} required autoComplete="new-password"/></label><button className="twin-primary-link">Accept invitation</button></form>:<>
      <form action="/agency/join/email" method="post"><input type="hidden" name="code" value={code}/><button className="twin-primary-link">Email me a verification link</button><p className="twin-help">For new staff accounts. Sent to the email your agency owner invited.</p></form>
      <details className="border-t border-line pt-4"><summary className="cursor-pointer">Already have a Twin staff login?</summary><form action="/agency/join/accept" method="post" className="twin-team-form mt-4 space-y-4"><input type="hidden" name="code" value={code}/><label>Email<input name="email" type="email" required maxLength={254} autoComplete="username"/></label><label>Password<input name="password" type="password" required maxLength={256} autoComplete="current-password"/></label><button className="twin-outline-link">Sign in and accept</button><p className="twin-help">An existing agency membership cannot be moved or overwritten by an invitation. Ask Twin admin if you need to change agencies.</p></form></details>
    </>}
  </div>;
}
