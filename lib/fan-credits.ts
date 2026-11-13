// Fan message-credit balance bounds. Shared by app/users/actions.ts (form input) and the /ai setFanCredits wrapper
// (a "use server" file may export only async functions). Ceiling: 10x the largest credit pack / starting grant in
// lib/clone-default-policy.ts. A value outside this is refused, never clamped.
export const MAX_FAN_CREDITS = 1_000_000;
export const isFanCredits = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= MAX_FAN_CREDITS;
