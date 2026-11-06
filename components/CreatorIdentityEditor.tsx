"use client";
import { useFlirtCreatorLocale } from "./FlirtCreatorLocale";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Clone } from "@/lib/types";
import PersonaFactsFields from "./clone/PersonaFactsFields";
import { useCloneConfig } from "./clone/useCloneConfig";
import { Section } from "./clone/fields";
import IntakeFields from "./IntakeFields";
import { Button } from "./ui/button";

// Reuse the existing Identity widgets. Configuration/Monetization/Advanced/View
// are never rendered, loaded or passed to this component.
export default function CreatorIdentityEditor({ clone, revision }: { clone: Partial<Clone>; revision: string }) {
  const { t } = useFlirtCreatorLocale();
  const [cfg, set] = useCloneConfig(clone as Clone);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const router = useRouter();
  return <div className="grid min-w-0 gap-4">
    <div><h1 className="text-2xl font-semibold text-ink">{t("Edit identity", "Editar perfil")}</h1><p className="mt-1 text-sm text-muted">{t("Your personal facts, voice, background and boundaries.", "Seus dados pessoais, sua voz, sua história e seus limites.")}</p></div>
    <div aria-label={t("Creator settings", "Configurações da criadora")} className="flex flex-wrap gap-2 rounded-xl border border-line bg-panel p-2"><span aria-current="page" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">{t("Identity", "Perfil")}</span></div>
    <form className="grid min-w-0 gap-4" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const data = new FormData(event.currentTarget);
      setBusy(true); setStatus("");
      try {
        const response = await fetch("/creator-auth/identity", { method: "POST", body: data, headers: { Accept: "application/json" } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Identity could not be saved");
        setStatus("Identity saved."); router.refresh();
      } catch (error) { setStatus(error instanceof Error ? error.message : "Identity could not be saved"); }
      finally { setBusy(false); }
    }}>
      <input type="hidden" name="revision" value={revision} />
      {/* PersonaFactsFields owns the name input. A second name field here
          caused FormData.get("name") to silently ignore edits in the original. */}
      <PersonaFactsFields clone={clone} legacyFields={clone.intake?.fields} cfg={cfg} set={set} part="all" />
      <Section title={t("Her own words", "Com suas próprias palavras")} hint={t("Your questionnaire and examples, in your own words.", "Seu questionário e seus exemplos, com suas próprias palavras.")}><IntakeFields fields={clone.intake?.fields} legacyAnswers={clone.intake?.answers} /></Section>
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel/95 p-4 shadow-lg backdrop-blur"><Button type="submit" disabled={busy}>{busy ? t("Saving…", "Salvando…") : t("Save identity", "Salvar perfil")}</Button>{status && <p role="status" className="text-sm text-ink">{status === "Identity saved." ? t(status, "Perfil salvo.") : t(status, "Não foi possível salvar o perfil. Confira os dados e tente novamente.")}</p>}</div>
    </form>
  </div>;
}
