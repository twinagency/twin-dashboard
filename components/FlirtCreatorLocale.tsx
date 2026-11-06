"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { flirtCreatorCopy, parseFlirtCreatorLocale, type FlirtCreatorLocale } from "@/lib/flirt-creator-locale";

const LocaleContext = createContext({ locale: "en" as FlirtCreatorLocale, enabled: false });

export function FlirtCreatorLocaleProvider({ locale, children }: { locale: FlirtCreatorLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={{ locale, enabled: true }}>{children}</LocaleContext.Provider>;
}

export function useFlirtCreatorLocale() {
  const { locale, enabled } = useContext(LocaleContext);
  return { locale, enabled, t: flirtCreatorCopy(locale) };
}

export function FlirtCreatorLanguageSwitch() {
  const { locale, enabled, t } = useFlirtCreatorLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, startTransition] = useTransition();

  async function changeLanguage(value: string) {
    const selected = parseFlirtCreatorLocale(value);
    if (!selected || saving || refreshing || selected === locale) return;
    setSaving(true);
    setFailed(false);
    try {
      const response = await fetch("/creator-auth/locale", {
        method: "POST",
        body: new URLSearchParams({ locale: selected }),
      });
      if (!response.ok) throw new Error("Could not set locale");
      startTransition(() => router.refresh());
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) return null;
  return <div className="relative shrink-0">
    <select aria-label={t("Language", "Idioma")} value={locale} disabled={saving || refreshing}
      onChange={event => void changeLanguage(event.target.value)}
      className="min-h-9 max-w-full rounded-lg border border-line bg-panel px-2 text-xs font-medium text-ink">
      <option value="en" lang="en">English</option>
      <option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
    </select>
    {failed && <p role="alert" className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-line bg-panel p-2 text-xs text-ink">{t("Could not switch language. Try again.", "Não foi possível alterar o idioma. Tente novamente.")}</p>}
  </div>;
}
