import CloneDefaultsForm from "@/components/CloneDefaultsForm";
import CloneDefaultSyncTable from "@/components/CloneDefaultSyncTable";
import { saveApiKeys, getApiKeyStatus, getCloneDefaults, getModelsInUse, getCloneDefaultStatuses } from "./actions";
import { API_KEY_FIELDS } from "./fields";
import { OPENROUTER_FIELD_NOTES } from "@/lib/openrouter-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";

export const metadata = {
  title: "Settings · Twin Console",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [status, cloneDefaults, modelsInUse, cloneStatuses] = await Promise.all([
    getApiKeyStatus(),
    getCloneDefaults(),
    getModelsInUse(),
    getCloneDefaultStatuses(),
  ]);
  return (
    <div className="dashboard-page space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        Settings
      </h1>

      <Card id="api-keys">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            API keys
            <Info text="Shared across all bots. Leave a field blank to keep the current key. Changes take effect within a minute, no redeploy. If unset here, the bot uses its .env key." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveApiKeys} className="grid gap-4">
            {API_KEY_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 flex items-center justify-between text-sm text-muted">
                  {f.label}
                  <span className="text-xs text-muted">
                    {status[f.key] ? `set: ${status[f.key]}` : "not set (using .env)"}
                  </span>
                </span>
                <Input
                  name={f.key}
                  type="password"
                  autoComplete="off"
                  placeholder={status[f.key] ? "•••••••• (leave blank to keep)" : "paste a new key"}
                />
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">Save keys</Button>
              <span className="text-xs text-muted">To clear a key back to .env, type <code>__CLEAR__</code>.</span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="openrouter-fields">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            OpenRouter request fields
            <Info text="The extra fields sent on every OpenRouter call, for every model, every clone. There are no per-clone code paths, so this is the whole fleet at once. Change it in bot/src/services/llm.ts, OPENROUTER_EXTRA_PARAMS." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 pr-4 font-medium">Field</th>
                <th className="pb-2 pr-4 font-medium">Value</th>
                <th className="pb-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {OPENROUTER_FIELD_NOTES.map((f) => (
                <tr key={f.field} className="border-t border-line align-top">
                  <td className="py-2 pr-4 font-mono text-xs">{f.field}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{f.value}</td>
                  <td className="py-2 text-muted">{f.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <div className="mb-2 text-sm font-medium text-ink">Models currently live</div>
            <div className="space-y-1 text-sm">
              {modelsInUse.length === 0 && <div className="text-muted">No clone has a model set.</div>}
              {modelsInUse.map((m) => (
                <div key={m.model} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs">{m.model}</span>
                  <span className="text-xs text-muted">{m.clones.join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="fleet-defaults">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Fleet config defaults
            <Info text="One template for config only (toggles, dials, discounts, models) — never identity or personality. A new creator inherits it automatically. Saving here also pushes it to every existing creator still marked 'Following default' below, immediately. Category pricing is NOT included: that's per-clone on each creator's PPVs page now, with its own Reprice action." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <CloneDefaultsForm defaults={cloneDefaults} />
          <div className="border-t border-line pt-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              Which creators are on this default
              <Info text="Following default: this template's values apply to her automatically on the next Save above, or immediately via Push. Custom: she's been detached and keeps her own values until switched back." />
            </div>
            <CloneDefaultSyncTable clones={cloneStatuses} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
