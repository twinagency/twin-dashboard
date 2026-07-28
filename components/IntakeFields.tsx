import { INTAKE_SECTIONS, proseValue } from "@/lib/intake";

const inputCls =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";

// Renders the prose half of the onboarding questionnaire (the typed facts live
// in PersonaFactsFields). Each field submits as `intake_<key>`; the server
// gathers them (see rowFromForm). Pre-fills from a clone's saved intake.fields —
// values saved under the RETIRED pre-audit keys are merged into the new
// consolidated boxes (see lib/intake.ts proseValue) so nothing is lost.
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
            {section.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs text-muted">{f.label}</span>
                {f.options ? (
                  <select name={`intake_${f.key}`} defaultValue={value(f.key)} className={inputCls}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.multiline ? (
                  <textarea
                    name={`intake_${f.key}`}
                    rows={f.key === "example_texts" ? 8 : 3}
                    defaultValue={value(f.key)}
                    placeholder={f.placeholder}
                    className={inputCls}
                  />
                ) : (
                  <input
                    type="text"
                    name={`intake_${f.key}`}
                    defaultValue={value(f.key)}
                    placeholder={f.placeholder}
                    className={inputCls}
                  />
                )}
                {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
