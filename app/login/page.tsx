import LoginForm from "./LoginForm";

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Allie<span className="text-brand">.</span> Admin
        </h1>
        <p className="mb-5 text-sm text-gray-500 dark:text-neutral-400">Sign in to continue.</p>
        <LoginForm next={next && next.startsWith("/") ? next : "/"} />
      </div>
    </div>
  );
}
