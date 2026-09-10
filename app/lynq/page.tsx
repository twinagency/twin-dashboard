import LynqLoginForm from "./LoginForm";
import LoginShell from "./LoginShell";

export const metadata = { title: "Sign in · LYNQ" };

export default async function LynqLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginShell>
    <LynqLoginForm initialError={!!error} />
  </LoginShell>;
}
