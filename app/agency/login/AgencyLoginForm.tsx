"use client";
import {useState} from "react";
export default function AgencyLoginForm({error}:{error:boolean}){
 const [pending,setPending]=useState(false);
 return <form action="/agency/auth" method="post" onSubmit={()=>setPending(true)}>
 {error&&<p role="alert">We could not sign you in. Check your login and password.</p>}
 <label htmlFor="agency-email">Login email</label>
 <input id="agency-email" name="email" type="email" required autoComplete="username" autoCapitalize="none" spellCheck={false}/>
 <label htmlFor="agency-password">Password</label>
 <input id="agency-password" name="password" type="password" required autoComplete="current-password"/>
 <button type="submit" disabled={pending} aria-busy={pending}>{pending?"Signing in…":"Sign in"}</button>
 </form>;
}
