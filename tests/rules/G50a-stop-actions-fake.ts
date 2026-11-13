// G50a support: stands in for app/mtproto-campaign/actions.ts ("use server", pulls lib/mtproto + the dashboard guard),
// swapped in ONLY for GlobalStopControl.tsx's import by tests/rules/G50a-stop-unknown-after-lift.test.tsx. Each
// globalStopAction call is answered by the test through globalThis.__g50aStop.
type Control = { calls: FormData[]; answer: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }> };
const control = ((globalThis as any).__g50aStop ??= { calls: [], answer: async () => ({ ok: false, error: "no answer set" }) }) as Control;
export async function globalStopAction(fd: FormData) {
  control.calls.push(fd);
  return control.answer(fd);
}
