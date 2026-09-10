export const dynamic = "force-dynamic";

export default function TetherBootstrap() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 py-12 text-white">
      <form action="/tether/bootstrap/provision" method="post" className="w-full max-w-md space-y-4 rounded-3xl border border-white/15 bg-white/5 p-8">
        <h1 className="text-2xl font-semibold">Tether operator bootstrap</h1>
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl bg-white px-3 py-3 text-black" />
        <input name="password" type="password" required placeholder="Password" className="w-full rounded-xl bg-white px-3 py-3 text-black" />
        <input name="token" type="password" required placeholder="Bootstrap token" className="w-full rounded-xl bg-white px-3 py-3 text-black" />
        <button className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-black">Provision operator</button>
      </form>
    </main>
  );
}
