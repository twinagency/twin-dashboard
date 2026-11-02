import { withAdmin, okOrError } from "@/lib/api-route";
import { runQuery } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// The fleet-wide prompt_templates rows: the templates lib/compiler.ts reads and
// the bot assembles the live prompt from.
//
// THESE ARE FLEET-WIDE. One row reaches every clone within ~60s, which is why
// bot/db/manual/ROLLBACK_*.sql snapshots exist and why this endpoint is
// read-only with no write counterpart. Per-clone material is /config.
export const GET = withAdmin(async () => {
  return okOrError(
    await runQuery({
      table: "prompt_templates",
      orderBy: "agent_type",
      ascending: true,
      limit: 200,
    }),
  );
});
