"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { KINDS, AREAS, SEVERITIES, STATUSES, type Kind, type Area, type Severity, type Status } from "@/lib/tracker";

// Every write to the tracker goes through this file. Nothing here touches git,
// deploys anything or changes a clone: the tracker is a record of work, not a
// way of doing work. See ../../lib/tracker.ts and
// ../../../bot/db/migrations/110_tracker.sql.

const PATH = "/tracker";

function pick<T extends string>(allowed: readonly T[], raw: FormDataEntryValue | null, fallback: T): T {
  const v = String(raw ?? "");
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

// ── report something ─────────────────────────────────────────────────────────
// Title is the only required field. Everything else has a sane default, because
// a form that refuses a half-finished report is a form that loses reports: the
// whole point is that a thought gets captured the moment it happens.
export async function createItem(fd: FormData): Promise<void> {
  const title = str(fd, "title");
  if (!title) throw new Error("a title is required");

  const { data, error } = await supabaseAdmin
    .from("tracker_items")
    .insert({
      title,
      body: str(fd, "body"),
      kind: pick<Kind>(KINDS, fd.get("kind"), "bug"),
      area: pick<Area>(AREAS, fd.get("area"), "bot"),
      severity: pick<Severity>(SEVERITIES, fd.get("severity"), "normal"),
      submitted_by: str(fd, "submitted_by") || "ronan",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Screenshots are optional and arrive on the same submit. An upload that
  // fails must NOT lose the written report, so the item row is already saved
  // by this point and attachment errors are swallowed per file.
  const files = fd.getAll("screenshots").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) await attachFile(data.id, file);

  revalidatePath(PATH);
}

// Screenshots live in the existing private `media` bucket under a tracker/
// prefix, viewed through the existing /api/media-sign signer. No second bucket
// to create, secure and remember to back up.
async function attachFile(itemId: string, file: File): Promise<void> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "screenshot";
  const path = `tracker/${itemId}/${Date.now()}-${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return;
  await supabaseAdmin.from("tracker_attachments").insert({
    item_id: itemId,
    path,
    filename: file.name,
    mime: file.type || "",
    bytes: file.size,
  });
}

export async function addAttachments(itemId: string, fd: FormData): Promise<void> {
  const files = fd.getAll("screenshots").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) await attachFile(itemId, file);
  revalidatePath(PATH);
}

export async function removeAttachment(attachmentId: string): Promise<void> {
  const { data } = await supabaseAdmin.from("tracker_attachments").select("path").eq("id", attachmentId).maybeSingle();
  if (data?.path) await supabaseAdmin.storage.from("media").remove([data.path]);
  await supabaseAdmin.from("tracker_attachments").delete().eq("id", attachmentId);
  revalidatePath(PATH);
}

// ── edit an item ─────────────────────────────────────────────────────────────
export async function updateItem(itemId: string, fd: FormData): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fd.has("title")) patch.title = str(fd, "title");
  if (fd.has("body")) patch.body = str(fd, "body");
  if (fd.has("fix_note")) patch.fix_note = str(fd, "fix_note");
  if (fd.has("kind")) patch.kind = pick<Kind>(KINDS, fd.get("kind"), "bug");
  if (fd.has("area")) patch.area = pick<Area>(AREAS, fd.get("area"), "bot");
  if (fd.has("severity")) patch.severity = pick<Severity>(SEVERITIES, fd.get("severity"), "normal");
  if (fd.has("status")) {
    const status = pick<Status>(STATUSES, fd.get("status"), "open");
    patch.status = status;
    patch.closed_at = status === "closed" || status === "wontfix" ? new Date().toISOString() : null;
  }
  const { error } = await supabaseAdmin.from("tracker_items").update(patch).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function setStatus(itemId: string, status: Status): Promise<void> {
  const fd = new FormData();
  fd.set("status", status);
  await updateItem(itemId, fd);
}

export async function deleteItem(itemId: string): Promise<void> {
  const { data } = await supabaseAdmin.from("tracker_attachments").select("path").eq("item_id", itemId);
  const paths = (data ?? []).map((a) => a.path).filter(Boolean);
  if (paths.length) await supabaseAdmin.storage.from("media").remove(paths);
  await supabaseAdmin.from("tracker_items").delete().eq("id", itemId);
  revalidatePath(PATH);
}

// ── notes ────────────────────────────────────────────────────────────────────
export async function addNote(itemId: string, fd: FormData): Promise<void> {
  const body = str(fd, "body");
  if (!body) return;
  await supabaseAdmin.from("tracker_notes").insert({
    item_id: itemId,
    author: str(fd, "author") || "ronan",
    body,
  });
  revalidatePath(PATH);
}

export async function deleteNote(noteId: string): Promise<void> {
  await supabaseAdmin.from("tracker_notes").delete().eq("id", noteId);
  revalidatePath(PATH);
}

// ── commits ──────────────────────────────────────────────────────────────────
// Pasted by hand or written by a session. Duplicates are ignored rather than
// erroring: attaching the same commit twice is a normal thing to do and should
// not throw a red box at anybody.
export async function addCommit(itemId: string, fd: FormData): Promise<void> {
  const sha = str(fd, "sha");
  if (!sha) return;
  await supabaseAdmin.from("tracker_commits").upsert(
    {
      item_id: itemId,
      repo: str(fd, "repo") || "bot",
      sha,
      subject: str(fd, "subject"),
      authored_at: str(fd, "authored_at") || null,
    },
    { onConflict: "item_id,repo,sha", ignoreDuplicates: true },
  );
  revalidatePath(PATH);
}

export async function deleteCommit(commitId: string): Promise<void> {
  await supabaseAdmin.from("tracker_commits").delete().eq("id", commitId);
  revalidatePath(PATH);
}

// ── batches ──────────────────────────────────────────────────────────────────
// A batch is the handful of items being fixed and shipped together. There is at
// most one batch being worked at a time on purpose: this project has exactly
// one deployer, and two open batches would mean two people shipping trees over
// each other (see CLAUDE.md, "One deployer at a time").
export async function startBatch(fd: FormData): Promise<void> {
  const ids = fd.getAll("item_ids").map(String).filter(Boolean);

  const { data: existing } = await supabaseAdmin
    .from("tracker_batches")
    .select("id,number,status")
    .order("number", { ascending: false });

  const open = (existing ?? []).find((b) => b.status === "working");
  let batchId: string;

  if (open) {
    batchId = open.id;
  } else {
    const nextNumber = ((existing ?? [])[0]?.number ?? 0) + 1;
    const { data, error } = await supabaseAdmin
      .from("tracker_batches")
      .insert({ number: nextNumber, title: str(fd, "title") })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    batchId = data.id;
  }

  if (ids.length) {
    await supabaseAdmin
      .from("tracker_items")
      .update({ batch_id: batchId, updated_at: new Date().toISOString() })
      .in("id", ids);
  }
  revalidatePath(PATH);
}

export async function addToBatch(itemId: string, batchId: string): Promise<void> {
  await supabaseAdmin
    .from("tracker_items")
    .update({ batch_id: batchId, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  revalidatePath(PATH);
}

// Back to the open pile. Its status is reset too: an item that never shipped is
// not "fixed", and leaving a stale status behind is how the archive starts
// lying.
export async function removeFromBatch(itemId: string): Promise<void> {
  await supabaseAdmin
    .from("tracker_items")
    .update({ batch_id: null, status: "open", updated_at: new Date().toISOString() })
    .eq("id", itemId);
  revalidatePath(PATH);
}

export async function updateBatch(batchId: string, fd: FormData): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fd.has("title")) patch.title = str(fd, "title");
  if (fd.has("deploy_note")) patch.deploy_note = str(fd, "deploy_note");
  if (fd.has("status")) {
    const status = pick(["working", "shipped", "live"] as const, fd.get("status"), "working");
    patch.status = status;
    // Timestamps are stamped when the stage is reached and never cleared by a
    // later edit, so the archive keeps the real dates even if somebody moves a
    // batch back a stage to correct a mistake.
    if (status === "shipped") patch.shipped_at = new Date().toISOString();
    if (status === "live") {
      patch.live_at = new Date().toISOString();
      // Everything in a live batch is live. Set here rather than asking the
      // operator to tick six rows one at a time.
      await supabaseAdmin
        .from("tracker_items")
        .update({ status: "live", updated_at: new Date().toISOString() })
        .eq("batch_id", batchId)
        .not("status", "in", '("closed","wontfix")');
    }
  }
  const { error } = await supabaseAdmin.from("tracker_batches").update(patch).eq("id", batchId);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

// Deleting a batch never deletes the work. Its items go back to the open pile,
// which is the only safe thing to do with a record of outstanding bugs.
export async function deleteBatch(batchId: string): Promise<void> {
  await supabaseAdmin
    .from("tracker_items")
    .update({ batch_id: null, status: "open", updated_at: new Date().toISOString() })
    .eq("batch_id", batchId);
  await supabaseAdmin.from("tracker_batches").delete().eq("id", batchId);
  revalidatePath(PATH);
}
