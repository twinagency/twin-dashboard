// Fake of app/clones/actions.ts: records calls, behaviour programmed by the test via globalThis.__w7fakes.
const f = (globalThis.__w7fakes ??= { calls: [], impl: {} });
const call = (name, args, fallback) => { f.calls.push({ name, args }); return (f.impl[name] ?? fallback)(...args); };
export const createCloneRow = async (...a) => call("createCloneRow", a, async () => "clone-fake-1");
export const deleteClone = async (...a) => call("deleteClone", a, async () => undefined);
export const compileCloneAction = async (...a) => call("compileCloneAction", a, async () => ({ ok: true }));
