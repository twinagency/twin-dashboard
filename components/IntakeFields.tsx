import { INTAKE_SECTIONS } from "@/lib/intake";

const inputCls =
  "w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-light dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500";

// Renders the structured onboarding questionnaire. Each field submits as
// `intake_<key>`; the server gathers them (see rowFromForm). Pre-fills from a
// clone's saved intake.fields, falling back to legacy free-text in "notes".
export default function IntakeFields({
  fields,
  legacyAnswers,
}: {
  fields?: Record<string, string> | null;
  legacyAnswers?: string;
}) {
  const value = (key: string) => {
    const v = fields?.[key];
    if (v != null) return v;
    // Old clones stored one free-text blob — keep it in "notes" so nothing is lost.
    if (key === "notes" && !fields) return legacyAnswers ?? "";
    return "";
  };

  return (
    <div className="grid gap-6">
      {INTAKE_SECTIONS.map((section) => (
        <div key={section.title} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-neutral-200">{section.title}</h3>
          {section.hint && <p className="mt-0.5 text-xs text-gray-400 dark:text-neutral-500">{section.hint}</p>}
          <div className="mt-3 grid gap-3">
            {section.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-neutral-400">{f.label}</span>
                {f.multiline ? (
                  <textarea
                    name={`intake_${f.key}`}
                    rows={f.key === "example_texts" ? 6 : 3}
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
                {f.hint && <span className="mt-1 block text-xs text-gray-400 dark:text-neutral-500">{f.hint}</span>}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
