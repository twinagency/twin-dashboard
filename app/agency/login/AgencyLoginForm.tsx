"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AgencyLoginForm({ error }: { error: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <form action="/agency/auth" method="post" className="grid gap-4" onSubmit={() => setPending(true)}>
      <label className="block" htmlFor="agency-email">
        <span className="mb-1 block text-sm text-muted">Login email</span>
        <Input id="agency-email" name="email" type="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
      </label>
      <label className="block" htmlFor="agency-password">
        <span className="mb-1 block text-sm text-muted">Password</span>
        <Input id="agency-password" name="password" type="password" required autoComplete="current-password" />
      </label>
      {error && <p role="alert" className="text-sm text-crit">We could not sign you in. Check your login and password.</p>}
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <a className="text-center text-sm text-muted underline" href="/login?owner=1&next=%2Frevenue">
        Admin sign in
      </a>
    </form>
  );
}
