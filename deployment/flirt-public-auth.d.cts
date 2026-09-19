export function publicAuthConfig(input: {
  ref?: string;
  url?: string;
  key?: string;
}): { url: string; key: string; storageKey: string };
