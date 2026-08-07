import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { listKeys } from "@/lib/api-keys-admin";
import { KeyManager } from "./KeyManager";
import { ApiDocs } from "./ApiDocs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";

export const metadata = {
  title: "API access · Twin Admin",
};

export const dynamic = "force-dynamic";

export default async function ApiAccessPage() {
  // Respects the header clone switcher like every other page: "All" shows the
  // whole fleet's keys, picking a model narrows to hers. Issuing is always
  // explicit about which model, regardless of the current scope, because a key
  // that silently inherited the scope would be the easiest possible way to
  // hand the wrong girl's data to someone.
  const scopedCloneId = await getCloneScope();

  const [{ data: cloneRows }, keys] = await Promise.all([
    supabaseAdmin.from("clones").select("id,slug,name").order("created_at", { ascending: true }),
    listKeys(scopedCloneId),
  ]);
  const clones = (cloneRows ?? []) as { id: string; slug: string; name: string }[];

  return (
    <div className="dashboard-page space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">API access</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Keys
            <Info text="One key gives one model read-only access to her own revenue and fan data, for a dashboard hosted anywhere. Not the same thing as the Settings page's API keys, which are our OpenRouter, ElevenLabs and Deepgram credentials." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <KeyManager clones={clones} keys={keys} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            How to use it
            <Info text="Hand this section to whoever is building the model's dashboard. Everything they need is here." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ApiDocs />
        </CardContent>
      </Card>
    </div>
  );
}
