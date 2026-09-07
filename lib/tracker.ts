import { supabaseAdmin } from "./supabase";
import {mapItem,sortOpen,isOpen,type TrackerBoard,type TrackerBatch,type ItemRow} from "./tracker-shared";
export * from "./tracker-shared";
export async function loadBoard(): Promise<TrackerBoard> {
  const [itemsRes, batchesRes, commitsRes, notesRes, attsRes, jobsRes] = await Promise.all([
    supabaseAdmin.from("tracker_items").select("*").order("number", { ascending: false }),
    supabaseAdmin.from("tracker_batches").select("*").order("number", { ascending: false }),
    supabaseAdmin.from("tracker_commits").select("*").order("authored_at", { ascending: true }),
    supabaseAdmin.from("tracker_notes").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("tracker_attachments").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("tracker_bot_jobs").select("id,bot,item_id,status,result").order("created_at", { ascending: false }).limit(200),
  ]);

  const items = (itemsRes.data ?? []).map((r) => mapItem(r as ItemRow));
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const c of commitsRes.data ?? []) {
    byId.get(c.item_id)?.commits.push({
      id: c.id,
      repo: c.repo,
      sha: c.sha,
      subject: c.subject ?? "",
      authoredAt: c.authored_at,
    });
  }
  for (const n of notesRes.data ?? []) {
    byId.get(n.item_id)?.notes.push({ id: n.id, author: n.author, body: n.body, createdAt: n.created_at });
  }
  for (const a of attsRes.data ?? []) {
    byId.get(a.item_id)?.attachments.push({
      id: a.id,
      path: a.path,
      filename: a.filename ?? "",
      mime: a.mime ?? "",
      bytes: a.bytes ?? 0,
    });
  }

  const batches: TrackerBatch[] = (batchesRes.data ?? []).map((b) => ({
    id: b.id,
    number: b.number,
    title: b.title ?? "",
    status: b.status,
    summary: b.summary ?? "",
    deployNote: b.deploy_note ?? "",
    shippedAt: b.shipped_at,
    liveAt: b.live_at,
    createdAt: b.created_at,
    items: items.filter((i) => i.batchId === b.id).sort((a, c) => a.number - c.number),
  }));

  const liveBatchIds = new Set(batches.filter((b) => b.status === "live").map((b) => b.id));

  return {
    open: sortOpen(items.filter((i) => isOpen(i, liveBatchIds))),
    batches,
    dropped: items.filter((i) => i.status === "closed" || i.status === "wontfix"),
    jobs: (jobsRes.data ?? []).map((j) => ({ id: j.id, bot: j.bot, itemId: j.item_id, status: j.status, result: j.result ?? "" })),
  };
}

