import ThemeToggle from "@/components/ThemeToggle";
import CurrencyToggle from "@/components/CurrencyToggle";
import { saveApiKeys, getApiKeyStatus } from "./actions";
import { API_KEY_FIELDS } from "./fields";

export const metadata = {
  title: "Settings · Allie Admin",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const status = await getApiKeyStatus();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        Settings
      </h1>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-1">
          <h2 className="font-medium text-gray-900 dark:text-white">API keys</h2>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Shared across all bots. Leave a field blank to keep the current key. Changes take effect within a minute, no redeploy. If unset here, the bot uses its .env key.
          </p>
        </div>
        <form action={saveApiKeys} className="mt-4 grid gap-4">
          {API_KEY_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 flex items-center justify-between text-sm text-gray-700 dark:text-neutral-300">
                {f.label}
                <span className="text-xs text-gray-400 dark:text-neutral-500">
                  {status[f.key] ? `set: ${status[f.key]}` : "not set (using .env)"}
                </span>
              </span>
              <input
                name={f.key}
                type="password"
                autoComplete="off"
                placeholder={status[f.key] ? "•••••••• (leave blank to keep)" : "paste a new key"}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder-neutral-600"
              />
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200">
              Save keys
            </button>
            <span className="text-xs text-gray-400 dark:text-neutral-500">To clear a key back to .env, type <code>__CLEAR__</code>.</span>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium text-gray-900 dark:text-white">Appearance</h2>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Choose light or dark mode for the admin.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium text-gray-900 dark:text-white">Currency</h2>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Display amounts in AUD or USD.
            </p>
          </div>
          <CurrencyToggle />
        </div>
      </section>
    </div>
  );
}
