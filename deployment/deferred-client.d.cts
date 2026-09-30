export function deferredClient<T>(resolveClient: () => T | Promise<T>): T;
