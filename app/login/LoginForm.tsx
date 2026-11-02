"use client";


import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginForm({ next, error, owner = false }: { next: string; error?: boolean; owner?: boolean }) {

  return (
    <form action="/admin-auth" method="post" className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      {owner && <>
        <input type="hidden" name="mode" value="owner" />
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Username</span>
          <Input name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} autoFocus required />
        </label>
      </>}
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus={!owner}
          required
        />
      </label>
      {error && <p role="alert" className="text-sm text-crit">Unable to sign in. Check your details, or try again in 15 minutes.</p>}
      <Button type="submit" className="w-full">
        Sign in
      </Button>
      <a className="text-center text-sm text-muted underline" href={`/login?${owner ? "" : "owner=1&"}next=${encodeURIComponent(next)}`}>
        {owner ? "Use existing admin password" : "Sign in with an owner account"}
      </a>
    </form>
  );
}

