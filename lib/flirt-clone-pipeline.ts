import { flirtClonePipelineEnabled, buildClonePacket, buildTwinCloneRow, slugify, CloneBuildRefusal, type BuildInput, type ClonePacket, type RefusalCode } from "./flirt-clone-build";
import type { TwinCloneWriter } from "./flirt-twin-writer";

// Orchestration for "approved FLIRT applicant -> paused clone in Twin".
// Every dependency is injected so tests run with fakes and no network. The factories
// are LAZY: with the flag off nothing is constructed, read or written.
export type CreatorRecord = { input: Omit<BuildInput, "now">; link: { twin_slug: string | null } | null };
export interface CloneBuildStore {
  load(creatorAccountId: string): Promise<CreatorRecord | null>;
  saveLink(creatorAccountId: string, twinSlug: string): Promise<void>;
}
export type PipelineDeps = {
  env?: Record<string, string | undefined>;
  now?: Date;
  store: () => CloneBuildStore;
  writer: () => TwinCloneWriter;
};
export type BuildOutcome =
  | { kind: "disabled" }
  | { kind: "built"; slug: string; reused: boolean; warnings: string[] }
  | { kind: "already_linked"; slug: string }
  | { kind: "refused"; code: RefusalCode | "unknown_creator"; message: string }
  | { kind: "error"; message: string };

export async function runCloneBuild(creatorAccountId: string, deps: PipelineDeps): Promise<BuildOutcome> {
  if (!flirtClonePipelineEnabled(deps.env ?? process.env)) return { kind: "disabled" };
  try {
    const store = deps.store();
    const record = await store.load(creatorAccountId);
    if (!record) return { kind: "refused", code: "unknown_creator", message: "Creator account not found." };
    if (record.link?.twin_slug) return { kind: "already_linked", slug: record.link.twin_slug };
    let packet: ClonePacket;
    try { packet = buildClonePacket({ ...record.input, now: deps.now }); }
    catch (error) {
      if (error instanceof CloneBuildRefusal) return { kind: "refused", code: error.code, message: error.message };
      throw error;
    }
    const writer = deps.writer();
    // A previous run may have inserted the clone and then failed to save the link.
    const existing = await writer.findByCreator(packet.creator_account_id);
    if (existing) { await store.saveLink(creatorAccountId, existing.slug); return { kind: "built", slug: existing.slug, reused: true, warnings: packet.warnings }; }

    const base = slugify(packet.name) || "creator";
    let slug = base;
    if (await writer.slugTaken(slug)) {
      slug = `${base}-${packet.creator_account_id.slice(0, 6)}`;
      if (await writer.slugTaken(slug)) return { kind: "error", message: "Could not find a free clone slug." };
    }
    let created: { id: string; slug: string };
    try { created = await writer.insert(buildTwinCloneRow(packet, slug)); }
    catch (error) {
      // Two clicks at once: the unique slug stopped the second insert. Reuse the first.
      const raced = (error as { code?: string }).code === "23505" ? await writer.findByCreator(packet.creator_account_id) : null;
      if (!raced) throw error;
      created = raced;
    }
    try { await store.saveLink(creatorAccountId, created.slug); }
    catch { return { kind: "error", message: `Clone "${created.slug}" was created in Twin but the link could not be saved. Press Build clone again to finish.` }; }
    return { kind: "built", slug: created.slug, reused: false, warnings: packet.warnings };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Clone build failed." };
  }
}
