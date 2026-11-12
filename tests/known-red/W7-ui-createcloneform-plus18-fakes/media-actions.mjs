// Fake of app/media/actions.ts: records calls, behaviour programmed by the test via globalThis.__w7fakes.
const f = (globalThis.__w7fakes ??= { calls: [], impl: {} });
const call = (name, args, fallback) => { f.calls.push({ name, args }); return (f.impl[name] ?? fallback)(...args); };
export const uploadPhoto = async (...a) => call("uploadPhoto", a, async () => ({ ok: true }));
export const uploadVideo = async (...a) => call("uploadVideo", a, async () => ({ ok: true }));
export const createBundle = async (...a) => call("createBundle", a, async () => "bundle-fake-1");
export const addBundleItem = async (...a) => call("addBundleItem", a, async () => undefined);
