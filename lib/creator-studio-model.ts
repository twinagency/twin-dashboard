export type CreatorStudioBrand = "flirt" | "moxy";
export type CreatorStudioPhase = "draft" | "submitted" | "reviewing" | "approved" | "changes" | "withdrawn" | "ready" | "paused" | "connected";
export type CreatorStudioStatus = { phase: CreatorStudioPhase; label: string; linked: boolean };

/** Application progress and AI activation are independent server-owned states. */
export function creatorStudioStatus(linked: boolean, applicationLabel: string, cloneStatus?: string | null): CreatorStudioStatus {
  if (linked) {
    if (cloneStatus === "active") return { phase: "ready", label: "Your AI is ready", linked: true };
    if (cloneStatus === "paused") return { phase: "paused", label: "Your AI is paused", linked: true };
    return { phase: "connected", label: "AI profile connected", linked: true };
  }
  const phases: Record<string, CreatorStudioPhase> = { Submitted: "submitted", "Under review": "reviewing", Approved: "approved", "Changes required": "changes", Withdrawn: "withdrawn" };
  return { phase: phases[applicationLabel] || "draft", label: phases[applicationLabel] ? applicationLabel : "Setup in progress", linked: false };
}

export const STUDIO_PERIODS = [
  { key: "1W", label: "7 days" }, { key: "1M", label: "30 days" }, { key: "3M", label: "90 days" },
] as const;
export type StudioPeriod = typeof STUDIO_PERIODS[number]["key"];
export type StudioPerformance = { stars: number; activeFans: number; conversations: number; series: { bucket: string; stars: number }[]; stale: boolean };

/** Only aggregate fields cross into the studio view. Never infer zero from missing data. */
export function readStudioPerformance(payload: unknown, cloneId: string, period: StudioPeriod): StudioPerformance {
  if (!payload || typeof payload !== "object") throw new Error("Performance is unavailable.");
  const value = payload as { period?: unknown; perClone?: Record<string, { stars?: unknown; activeUsers?: unknown }>; series?: unknown; analytics?: { conversationFunnel?: { conversations?: unknown } }; stale?: boolean };
  const stats = value.perClone?.[cloneId];
  const conversations = value.analytics?.conversationFunnel?.conversations;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (value.period !== period || !stats || !finite(stats.stars) || !finite(stats.activeUsers) || !finite(conversations) || !Array.isArray(value.series)) throw new Error("Performance is unavailable.");
  const series = value.series.map((row: Record<string, unknown>) => {
    if (typeof row.bucket !== "string" || !finite(row[cloneId])) throw new Error("The earnings chart is unavailable.");
    return { bucket: row.bucket, stars: row[cloneId] as number };
  });
  return { stars: stats.stars, activeFans: stats.activeUsers, conversations, series, stale: value.stale === true };
}

const portugueseStatusLabels: Record<CreatorStudioPhase, string> = {
  draft: "Configuração em andamento",
  submitted: "Cadastro enviado",
  reviewing: "Em análise",
  approved: "Cadastro aprovado",
  changes: "Ajustes solicitados",
  withdrawn: "Cadastro retirado",
  ready: "Sua IA está pronta",
  paused: "Sua IA está pausada",
  connected: "Perfil de IA conectado",
};

export function creatorStudioStatusLabel(status: CreatorStudioStatus, locale: "en" | "pt-BR"): string {
  return locale === "pt-BR" ? portugueseStatusLabels[status.phase] : status.label;
}
