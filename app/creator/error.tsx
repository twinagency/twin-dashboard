"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";
export default function CreatorPageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useFlirtCreatorLocale();
  return <section role="alert" className="rounded-2xl border border-line bg-panel p-6"><h2 className="text-lg font-semibold text-ink">{t("This page could not be loaded", "Não foi possível carregar esta página")}</h2><p className="mt-2 text-sm text-muted">{t("Your account and saved information have not been changed. Try loading the page again.", "Sua conta e seus dados salvos continuam como estavam. Tente carregar a página novamente.")}</p><button type="button" onClick={reset} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">{t("Try again", "Tentar novamente")}</button></section>;
}
