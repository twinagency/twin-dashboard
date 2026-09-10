import LynqLoginForm from "../lynq/LoginForm";
import LoginShell from "../lynq/LoginShell";

export const metadata = { title: "Sign in · Link" };
export const dynamic = "force-dynamic";

export default async function LinkLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginShell>
    <LynqLoginForm initialError={!!error} action="/link/auth" />
  </LoginShell>;
}
