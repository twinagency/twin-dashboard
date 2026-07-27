"use client";

import { INTAKE_SECTIONS, proseValue } from "@/lib/intake";
import { listEntries } from "@/lib/persona-build";
import { Field, LineList, Select, inputCls } from "@/components/clone/fields";

// The prose half of the onboarding questionnaire (typed facts live in
// PersonaFactsFields). Each field submits as `intake_<key>`; the server gathers
// them (see rowFromForm). Pre-fills from a clone's saved intake.fields — values
// saved under the RETIRED pre-audit keys merge into the new consolidated boxes
// (lib/intake.ts proseValue) so nothing is lost.
//
// Multiline fields render as LineList (one entry per row) rather than one blob:
// what an operator types now reaches her prompt verbatim via
// lib/persona-build.ts, so the entries are the unit that matters, not the
// paragraph. Nothing here is rewritten by a model any more.
export default function IntakeFields({
  fields,
  legacyAnswers,
}: {
  fields?: Record<string, string> | null;
  legacyAnswers?: string;
}) {
  const value = (key: string) => {
    const v = proseValue(key, fields);
    if (v) return v;
    // Very old clones stored one free-text blob — keep it in "notes" so nothing is lost.
    if (key === "notes" && !fields) return legacyAnswers ?? "";
    return "";
  };

  return (
    <div className="grid gap-6">
      {INTAKE_SECTIONS.map((section) => (
        <div key={section.title} className="rounded-lg border border-line bg-bg/50 p-4">
          <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
          {section.hint && <p className="mt-0.5 text-xs text-muted">{section.hint}</p>}
          <div className="mt-3 grid gap-3">
            {section.fields.map((f) =>
              f.options ? (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs text-muted">{f.label}</span>
                  <select name={`intake_${f.key}`} defaultValue={value(f.key)} className={inputCls}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : f.multiline ? (
                <LineList
                  key={f.key}
                  label={f.label}
                  name={`intake_${f.key}`}
                  initial={listEntries(value(f.key))}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  rows={f.key === "example_texts" ? 2 : 3}
                />
              ) : (
                <Field
                  key={f.key}
                  label={f.label}
                  name={`intake_${f.key}`}
                  defaultValue={value(f.key)}
                  placeholder={f.placeholder}
                  hint={f.hint}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
