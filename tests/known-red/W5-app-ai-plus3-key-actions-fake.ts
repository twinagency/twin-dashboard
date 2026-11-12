// Fake for app/api-access/actions.ts, swapped in ONLY by the W5-app-ai-plus3 key-reveal known-red test (module
// resolution hook, declared there). Same exports and IssueState shape; each issueKeyAction call is answered by the
// test through globalThis.__w5KeyActions so the test controls the minted key and how long the request stays pending.
export type IssueState = { key?: string; prefix?: string; scope?: "clone" | "fleet"; error?: string };
type Control = { calls: FormData[]; answer: (fd: FormData) => Promise<IssueState> };
const control = ((globalThis as any).__w5KeyActions ??= { calls: [], answer: async () => ({ error: "no answer set" }) }) as Control;
export async function issueKeyAction(_prev: IssueState, fd: FormData): Promise<IssueState> {
  control.calls.push(fd);
  return control.answer(fd);
}
export async function revokeKeyAction(_fd: FormData): Promise<void> {}
