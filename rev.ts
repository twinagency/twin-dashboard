import { recordDryRunReview, confirmLive, getRun } from "@/lib/mtproto/runs";
const [mode, id] = process.argv.slice(2);
(async () => {
  const r = await getRun(id); console.log("status", r?.status, "dry", r?.dryRun);
  if (r?.status !== "done") return;
  const s = await recordDryRunReview(id, "Ronan via Claude"); console.log(JSON.stringify(s).slice(0, 700));
  if (mode === "live") { const x = await confirmLive(id, "Ronan via Claude", "GO LIVE"); console.log("LIVE", x.status, x.confirmLiveAt); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
