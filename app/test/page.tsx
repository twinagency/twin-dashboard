import { supabaseAdmin } from "@/lib/supabase";
import { listTestRuns, testRunsAvailable, TEST_PERSONAS } from "@/lib/test-runs";
import TestConsole from "./TestConsole";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Test · Allie Admin",
};

// An AI plays a fan (one of the personas below) and holds a live conversation
// with a real clone through the real handleMessage() pipeline — real Supabase
// reads, real AI replies — via bot/src/dev/test-run.ts, spawned as a child
// process. See lib/test-runs.ts for the isolation model and how it's invoked.
export default async function TestPage() {
  const [clonesRes, history] = await Promise.all([
    supabaseAdmin.from("clones").select("id,slug,name,status").order("name"),
    listTestRuns({ limit: 30 }),
  ]);

  const clones = (clonesRes.data ?? []) as { id: string; slug: string; name: string; status: string }[];

  return (
    <TestConsole
      clones={clones}
      personas={TEST_PERSONAS}
      initialHistory={history}
      available={testRunsAvailable()}
    />
  );
}
