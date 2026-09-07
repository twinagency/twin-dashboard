"use client";


import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginForm({ next, error }: { next: string; error?: boolean }) {

  return (
    <form action="/admin-auth" method="post" className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </label>
      {error && <p className="text-sm text-crit">Unable to sign in. Check your password.</p>}
      <Button type="submit" className="w-full">
        Sign in
      </Button>
    </form>
  );
}

