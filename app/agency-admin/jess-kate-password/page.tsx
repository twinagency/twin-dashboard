import { isAuthed } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function PasswordPage({searchParams}:{searchParams:Promise<{result?:string}>}) {
  if (!await isAuthed()) redirect("/twin");
  const { result } = await searchParams;
  return <main className="dashboard-page max-w-lg">
    <h1 className="mb-6 text-2xl font-semibold">Jess and Kate AI password</h1>
    {result && <p role="status" className="mb-4">{result === "saved" ? "Password updated." : "Password could not be updated."}</p>}
    <form method="post" action="/agency-admin/jess-kate-password/update" className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <label className="block">New password<input type="password" name="password" minLength={16} maxLength={256} autoComplete="new-password" required className="mt-2 w-full rounded-lg border border-line p-3" /></label>
      <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-white">Save password</button>
    </form>
  </main>;
}
