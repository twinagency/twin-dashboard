import CloneDefaultsForm from "@/components/CloneDefaultsForm";
import { saveApiKeys, getApiKeyStatus, getCloneDefaults } from "./actions";
import { API_KEY_FIELDS } from "./fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";

export const metadata = {
  title: "Settings · Twin Console",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [status, cloneDefaults] = await Promise.all([getApiKeyStatus(), getCloneDefaults()]);
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            New-creator defaults
            <Info text="The template every new creator starts from. A fresh creator inherits these toggles, dials and models; you can still change anything per creator before going live. Unset fields fall back to the built-in defaults." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CloneDefaultsForm defaults={cloneDefaults} />
        </CardContent>
      </Card>
    </div>
  );
}
