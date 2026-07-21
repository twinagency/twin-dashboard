import LoginForm from "./LoginForm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata = {
  title: "Sign in · Allie Admin",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Twin<span className="text-ink">.</span> Admin
          </h1>
          <p className="text-sm text-muted">Sign in to continue.</p>
        </CardHeader>
        <CardContent>
          <LoginForm next={next && next.startsWith("/") ? next : "/"} />
        </CardContent>
      </Card>
    </div>
  );
}
