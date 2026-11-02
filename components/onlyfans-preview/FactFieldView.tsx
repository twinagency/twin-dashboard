import type { ReactNode } from "react";
import { FACT_SOURCE_LABEL, factSource } from "@/lib/onlyfans/section8";

/** One approved fact. An empty saved value shows "Not provided" with an edit action instead of a blank input. */
export default function FactFieldView({ label, factKey, savedValue, value, overridden, sharedState, editing, readOnly, onEdit, children }: {
  label: string; factKey: string; savedValue: string; value: string; overridden: boolean; sharedState: string; editing: boolean; readOnly: boolean; onEdit: () => void; children: ReactNode;
}) {
  const source = factSource({ value: savedValue, overridden, sharedState });
  if (source === "not_provided" && !editing && !value && !readOnly) {
    return <div className="min-w-0 text-sm" data-of-fact-empty={factKey}>
      <div>{label}</div>
      <p className="mt-1 text-sm text-muted" data-of-fact-not-provided>{FACT_SOURCE_LABEL.not_provided}</p>
      <button type="button" data-of-add-fact={factKey} className="mt-1 text-xs font-semibold text-accent" onClick={onEdit}>Add value</button>
    </div>;
  }
  return <div className="min-w-0 text-sm"><label>{label}{children}</label>
    <span className="mt-1 block text-xs text-muted" data-of-fact-source={factKey}>{FACT_SOURCE_LABEL[source]}</span></div>;
}
