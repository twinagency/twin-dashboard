"use client";

import { useFlirtCreatorLocale } from "./FlirtCreatorLocale";

export default function FlirtCreatorFxNote() {
  const { locale } = useFlirtCreatorLocale();
  if (locale !== "pt-BR") return null;
  return <p className="mt-2 text-xs text-muted">
    Os valores convertidos são estimativas. <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" className="underline">Cotações da ExchangeRate-API</a>.
  </p>;
}
