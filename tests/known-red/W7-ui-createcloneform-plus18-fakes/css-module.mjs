export default new Proxy({}, { get: (_t, k) => (typeof k === "string" ? k : undefined) });
