import type { FlirtCreatorLocale } from "./flirt-creator-locale";

export type CreatorInvitationStatus = "required" | "valid" | "invalid" | "expired" | "exhausted" | "disabled" | "unavailable";
export const invitationMessages: Record<CreatorInvitationStatus, string> = {
  required: "A valid invitation is required. Enter the code from your invitation link.",
  valid: "Your invitation is ready.",
  invalid: "This invitation code was not recognized. Check the code or use a new invitation link.",
  expired: "This invitation has expired. Ask your agency for a new invitation.",
  exhausted: "This invitation has no places left. Ask your agency for a new invitation.",
  disabled: "This invitation is no longer active. Ask your agency for a new invitation.",
  unavailable: "We couldn't check this invitation right now. Please try again shortly. Your invitation has not been claimed.",
};
export function invitationStatus(row: { active: boolean; expires_at: string | null; max_uses: number | null; uses: number } | null, agencyActive: boolean, lookupFailed = false, now = Date.now()): CreatorInvitationStatus {
  if (lookupFailed) return "unavailable";
  if (!row) return "invalid";
  if (!row.active || !agencyActive) return "disabled";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "expired";
  if (row.max_uses != null && row.uses >= row.max_uses) return "exhausted";
  return "valid";
}

const portugueseInvitationMessages: Record<CreatorInvitationStatus, string> = {
  required: "É necessário um convite válido. Digite o código do seu link de convite.",
  valid: "Seu convite está pronto.",
  invalid: "Não reconhecemos este código. Confira o código ou use um novo link de convite.",
  expired: "Este convite expirou. Peça um novo convite à sua agência.",
  exhausted: "Este convite atingiu o limite de usos. Peça um novo convite à sua agência.",
  disabled: "Este convite não está mais ativo. Peça um novo convite à sua agência.",
  unavailable: "Não foi possível verificar o convite agora. Tente novamente em instantes. Seu convite ainda está disponível para uso.",
};

export function creatorInvitationMessage(status: CreatorInvitationStatus, locale: FlirtCreatorLocale): string | undefined {
  const messages = locale === "pt-BR" ? portugueseInvitationMessages : invitationMessages;
  return Object.hasOwn(messages, status) ? messages[status] : undefined;
}
