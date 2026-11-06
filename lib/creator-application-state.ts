/** Display state comes from the application, never from dashboard/AI access. */
export function creatorApplicationState(status: string | null | undefined, submittedAt?: string | null) {
  switch (status) {
    case "approved": return { label: "Approved", submitted: true, description: "Your onboarding application is approved." };
    case "reviewing": return { label: "Under review", submitted: true, description: "Your submitted application is under review." };
    case "submitted": return { label: "Submitted", submitted: true, description: "Your onboarding application has been submitted for review." };
    case "rejected": return { label: "Changes required", submitted: !!submittedAt, description: "Your application requires review. Contact your agency for the next steps." };
    case "withdrawn": return { label: "Withdrawn", submitted: !!submittedAt, description: "Your application has been withdrawn." };
    default: return { label: "Draft / unfinished", submitted: false, description: "Your onboarding is unfinished. Saved answers and media remain attached to your account; you can return to onboarding." };
  }
}

export function creatorApplicationStateLabel(label: string, locale: "en" | "pt-BR"): string {
  if (locale === "en") return label;
  switch (label) {
    case "Approved": return "Cadastro aprovado";
    case "Under review": return "Em análise";
    case "Submitted": return "Cadastro enviado";
    case "Changes required": return "Ajustes solicitados";
    case "Withdrawn": return "Cadastro retirado";
    case "Draft / unfinished": return "Rascunho";
    default: return label;
  }
}
