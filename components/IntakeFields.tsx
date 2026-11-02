"use client";

import { INTAKE_SECTIONS, proseValue } from "@/lib/intake";
import { listEntries } from "@/lib/persona-build";
import { Collapse, Field, FieldLabel, LineList, inputCls } from "@/components/clone/fields";

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

  // How many boxes in a section actually have something in them. Printed on the
  // closed card so the operator can see where the gaps are without opening all
  // of them, which is the whole point of collapsing these.
  const fillCount = (section: (typeof INTAKE_SECTIONS)[number]) =>
    section.fields.filter((f) => value(f.key).trim() !== "").length;

  return (
    <div className="grid gap-3">
      {INTAKE_SECTIONS.map((section) => {
        const filled = fillCount(section);
        return (
        <Collapse
          key={section.title}
          label={section.title}
          hint={section.hint}
          filled={filled > 0}
          summary={`${filled}/${section.fields.length} filled`}
        >
          <div className="grid gap-3">
            {section.fields.map((f) =>
              f.options ? (
                <label key={f.key} className="block">
                  <FieldLabel label={f.label} />
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
        </Collapse>
        );
      })}
    </div>
  );
}
