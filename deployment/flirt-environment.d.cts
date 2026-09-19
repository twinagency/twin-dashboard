export function assertDatabase(env?: Record<string, string | undefined>): string;
export function assertStartup(kind: "dashboard" | "bot", env?: Record<string, string | undefined>): string;
export function assertBotConfig(env?: Record<string, string | undefined>): void;
