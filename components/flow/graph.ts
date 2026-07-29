// Builds the n8n-style node graph for a clone's message pipeline, straight from
// the real runtime logic (src/handler.ts, src/flows/actions.ts, src/flows/smart.ts).
// It is CONFIG-DRIVEN: a capability that's toggled off on the clone produces no
// node — turn photos off and the photo/bundle/welcome-bundle nodes disappear.
//
// Two shapes:
//   Classic → a sorter picks exactly ONE lane per turn.
//   Smart   → one decision writes a reply AND may fire 0+ tools the same turn.

import type { Node, Edge } from "@xyflow/react";

// The subset of a clone's config the graph cares about (snake_case from Supabase).
export type CloneCfg = {
  ai_mode: "classic" | "smart";
  smart_split: boolean;
  charge_messages: boolean;
  photos_enabled: boolean;
  videos_enabled: boolean;
  bundles_enabled: boolean;
  voice_enabled: boolean;
  tips_enabled: boolean;
  discounts_enabled: boolean;
  emojis_enabled: boolean;
  live_captions_enabled: boolean;
  thank_you_enabled: boolean;
  drip_enabled: boolean;
  text_model: string;
  routing_model: string;
};

export type NodeKind =
  | "input"
  | "process"
  | "decision"
  | "lane"
  | "tool"
  | "sale"
  | "meter"
  | "paywall"
  | "background";

export type FlowData = {
  label: string;
  sub?: string;
  emoji?: string;
  kind: NodeKind;
  off?: boolean; // reserved: render a capability as greyed instead of hidden
};

export type BuiltGraph = {
  nodes: Node<FlowData>[];
  edges: Edge[];
  hidden: string[]; // capabilities suppressed because they're toggled off
  active: string[]; // cross-cutting modifiers currently on
};

const COL = 270; // px between columns
const ROW = 96; // px between stacked lanes

function n(
  id: string,
  col: number,
  row: number,
  data: FlowData,
): Node<FlowData> {
  return {
    id,
    position: { x: col * COL, y: row * ROW },
    data,
    type: "flowNode",
    // lanes fan out downward; entry chain sits centered
  };
}

function e(id: string, source: string, target: string, label?: string, dashed?: boolean): Edge {
  return {
    id,
    source,
    target,
    label,
    animated: false,
    style: dashed ? { strokeDasharray: "5 5" } : undefined,
    type: "smoothstep",
  };
}

// ── Classic ──────────────────────────────────────────────────────────────────
export function buildClassic(c: CloneCfg): BuiltGraph {
  const nodes: Node<FlowData>[] = [];
  const edges: Edge[] = [];
  const hidden: string[] = [];

  // Shared intake chain (columns 0–3), vertically centered around row 3.
  nodes.push(n("input", 0, 3, { label: "Fan message", emoji: "📩", kind: "input" }));
  nodes.push(n("guard", 1, 3, { label: "Dedup + resolve fan", sub: "name capture · memory window", emoji: "🧩", kind: "process" }));
  nodes.push(n("wait", 2, 3, { label: "Human-feel wait", sub: "silent, then typing…", emoji: "⏳", kind: "process" }));
  nodes.push(n("sawPic", 3, 3, { label: "Fan sent a photo/video?", emoji: "🖼️", kind: "decision" }));
  edges.push(e("e-in-guard", "input", "guard"));
  edges.push(e("e-guard-wait", "guard", "wait"));
  edges.push(e("e-wait-saw", "wait", "sawPic"));

  // Yes → vision (always available). No → router.
  nodes.push(n("vision", 4, 1, { label: "React to his media", sub: "she 'sees' it · metered", emoji: "👀", kind: "lane" }));
  nodes.push(n("router", 4, 4, { label: "Sorter picks ONE lane", sub: `model: ${c.routing_model || "routing"}`, emoji: "🧭", kind: "decision" }));
  edges.push(e("e-saw-vision", "sawPic", "vision", "yes"));
  edges.push(e("e-saw-router", "sawPic", "router", "no"));

  // Lanes (col 5), each gated by the clone's toggles. metered = costs a credit,
  // sale = a purchase (sendable even at 0 credits).
  type Lane = { id: string; label: string; emoji: string; sub: string; on: boolean; metered: boolean; offName?: string };
  const lanes: Lane[] = [
    { id: "text", label: "Chat back", emoji: "💬", sub: "text reply", on: true, metered: true },
    { id: "voice", label: "Voice note", emoji: "🎙️", sub: "ElevenLabs", on: c.voice_enabled, metered: true, offName: "Voice" },
    { id: "photo", label: "Send paid photo", emoji: "📷", sub: "locked · price in code", on: c.photos_enabled, metered: false, offName: "Photos" },
    { id: "video", label: "Send paid video", emoji: "🎬", sub: "locked · price in code", on: c.videos_enabled, metered: false, offName: "Videos" },
    { id: "bundle", label: "Send photo bundle", emoji: "🎁", sub: "next unseen set", on: c.photos_enabled && c.bundles_enabled, metered: false, offName: "Bundles" },
    { id: "tip", label: "Ask for tip / spoil", emoji: "💖", sub: "fixed menu · Stars", on: c.tips_enabled, metered: false, offName: "Tips / spoil" },
  ];

  const shown = lanes.filter((l) => l.on);
  shown.forEach((l, i) => {
    const row = 4 - (shown.length - 1) / 2 + i; // fan lanes around the router's row
    nodes.push(n(l.id, 5, row, { label: l.label, sub: l.sub, emoji: l.emoji, kind: l.metered ? "lane" : "sale" }));
    edges.push(e(`e-router-${l.id}`, "router", l.id));
  });
  lanes.filter((l) => !l.on && l.offName).forEach((l) => hidden.push(l.offName!));

  // Outcomes (col 6): metered lanes + vision → credit path; sale lanes → purchase.
  const meteredIds = ["vision", ...shown.filter((l) => l.metered).map((l) => l.id)];
  const saleIds = shown.filter((l) => !l.metered).map((l) => l.id);

  if (c.charge_messages) {
    nodes.push(n("gate", 6, 2, { label: "Credits left?", emoji: "🎫", kind: "decision" }));
    nodes.push(n("meter", 7, 1, { label: "Send + charge 1 credit", emoji: "✅", kind: "meter" }));
    nodes.push(n("paywall", 7, 3, { label: "Out of messages → paywall", sub: "buy-more button", emoji: "🔒", kind: "paywall" }));
    meteredIds.forEach((id) => edges.push(e(`e-${id}-gate`, id, "gate")));
    edges.push(e("e-gate-meter", "gate", "meter", "> 0"));
    edges.push(e("e-gate-paywall", "gate", "paywall", "= 0"));
  } else {
    nodes.push(n("meter", 6.5, 1.5, { label: "Send reply", sub: "unlimited free chat", emoji: "✅", kind: "meter" }));
    meteredIds.forEach((id) => edges.push(e(`e-${id}-meter`, id, "meter")));
  }

  if (saleIds.length) {
    nodes.push(n("sale", c.charge_messages ? 7 : 6.5, 5, { label: "Send paid content", sub: "free to send · buyable at 0 credits", emoji: "💸", kind: "sale" }));
    saleIds.forEach((id) => edges.push(e(`e-${id}-sale`, id, "sale")));
  }

  // Background jobs (separate cluster, dashed) — each gated.
  const bg: { id: string; label: string; emoji: string; sub: string; on: boolean }[] = [
    { id: "bg-drip", label: "Flow re-engage", emoji: "🔁", sub: "quiet-fan nudges", on: c.drip_enabled },
    // The "Welcome bundle" and "Onboarding voice" background nodes were removed
    // 2026-07-29. They were drawn from welcome_bundle_after /
    // onboarding_voice_after, columns no runtime code reads any more (onboarding
    // is the ordered step list now), so the diagram was showing two background
    // jobs that cannot fire.
  ];
  const bgShown = bg.filter((b) => b.on);
  bgShown.forEach((b, i) => nodes.push(n(b.id, i * 1.4, 7, { label: b.label, sub: b.sub, emoji: b.emoji, kind: "background" })));

  return { nodes, edges, hidden, active: modifiers(c) };
}

// ── Smart ────────────────────────────────────────────────────────────────────
export function buildSmart(c: CloneCfg): BuiltGraph {
  const nodes: Node<FlowData>[] = [];
  const edges: Edge[] = [];
  const hidden: string[] = [];

  nodes.push(n("input", 0, 3, { label: "Fan message", emoji: "📩", kind: "input" }));
  nodes.push(n("guard", 1, 3, { label: "Dedup + resolve fan", sub: "name capture · memory window", emoji: "🧩", kind: "process" }));
  nodes.push(n("wait", 2, 3, { label: "Human-feel wait", emoji: "⏳", kind: "process" }));
  nodes.push(n("sawPic", 3, 3, { label: "Fan sent a photo?", emoji: "🖼️", kind: "decision" }));
  edges.push(e("e-in-guard", "input", "guard"));
  edges.push(e("e-guard-wait", "guard", "wait"));
  edges.push(e("e-wait-saw", "wait", "sawPic"));

  nodes.push(n("vision", 4, 1, { label: "React to his photo", sub: "metered", emoji: "👀", kind: "lane" }));
  edges.push(e("e-saw-vision", "sawPic", "vision", "yes"));

  // The decision. Split → writer + decider in parallel. Combined → one model does both.
  if (c.smart_split) {
    nodes.push(n("writer", 4, 3, { label: "Writer", sub: `${c.text_model || "text model"} · writes her reply`, emoji: "✍️", kind: "decision" }));
    nodes.push(n("decider", 4, 5, { label: "Decider", sub: `${c.routing_model || "routing model"} · picks tools`, emoji: "🧠", kind: "decision" }));
    edges.push(e("e-saw-writer", "sawPic", "writer", "no"));
    edges.push(e("e-saw-decider", "sawPic", "decider", "no"));
  } else {
    nodes.push(n("decider", 4, 4, { label: "Writer + Decider", sub: `${c.text_model || "text model"} · reply + tools in one call`, emoji: "🧠", kind: "decision" }));
    edges.push(e("e-saw-decider", "sawPic", "decider", "no"));
  }
  const writerId = c.smart_split ? "writer" : "decider";

  // She always sends her written reply line (metered unless the turn makes a sale).
  nodes.push(n("reply", 6, 3, { label: "Send her reply", sub: "her words · may split into bubbles", emoji: "💬", kind: "meter" }));
  edges.push(e("e-writer-reply", writerId, "reply"));

  // Toolbox — capabilities she MAY fire this turn (0+), gated by toggles.
  type Tool = { id: string; label: string; emoji: string; sub: string; on: boolean; sale: boolean; offName?: string };
  const tools: Tool[] = [
    { id: "t-voice", label: "Voice note", emoji: "🎙️", sub: "reply spoken instead", on: c.voice_enabled, sale: false, offName: "Voice" },
    { id: "t-photo", label: "Send paid photo", emoji: "📷", sub: "locked · price in code", on: c.photos_enabled, sale: true, offName: "Photos" },
    { id: "t-video", label: "Send paid video", emoji: "🎬", sub: "locked · price in code", on: c.videos_enabled, sale: true, offName: "Videos" },
    { id: "t-bundle", label: "Send bundle", emoji: "🎁", sub: "next unseen set", on: c.photos_enabled && c.bundles_enabled, sale: true, offName: "Bundles" },
    { id: "t-tip", label: "Ask for tip / spoil", emoji: "💖", sub: "fixed menu · Stars", on: c.tips_enabled, sale: true, offName: "Tips / spoil" },
  ];
  const shown = tools.filter((t) => t.on);
  shown.forEach((t, i) => {
    const row = 5 + i; // stack the toolbox below the reply line
    nodes.push(n(t.id, 5, row, { label: t.label, sub: t.sub, emoji: t.emoji, kind: "tool" }));
    edges.push(e(`e-decider-${t.id}`, "decider", t.id, i === 0 ? "0+ tools" : undefined, true));
  });
  tools.filter((t) => !t.on && t.offName).forEach((t) => hidden.push(t.offName!));

  // Outcomes: pure chat/voice → charge a credit; any sale tool → free send.
  nodes.push(n("charge", 8, 3, { label: c.charge_messages ? "Charge 1 credit" : "No charge", sub: "only a pure chat/voice turn", emoji: c.charge_messages ? "✅" : "🆓", kind: "meter" }));
  edges.push(e("e-reply-charge", "reply", "charge"));
  const saleTools = shown.filter((t) => t.sale);
  if (saleTools.length) {
    nodes.push(n("sale", 8, 6, { label: "Send paid content", sub: "free to send · buyable at 0", emoji: "💸", kind: "sale" }));
    saleTools.forEach((t) => edges.push(e(`e-${t.id}-sale`, t.id, "sale")));
  }
  const voiceTool = shown.find((t) => t.id === "t-voice");
  if (voiceTool) edges.push(e("e-voice-charge", "t-voice", "charge"));

  return { nodes, edges, hidden, active: modifiers(c) };
}

// Cross-cutting modifiers that shape every reply (not lanes of their own).
function modifiers(c: CloneCfg): string[] {
  const m: string[] = [];
  if (c.discounts_enabled) m.push("Discounts (haggle-to-cap)");
  if (c.emojis_enabled) m.push("Emoji policy");
  if (c.live_captions_enabled) m.push("Live captions");
  if (c.thank_you_enabled) m.push("Thank-you messages");
  if (c.charge_messages) m.push("Metered credits");
  return m;
}

export function buildGraph(mode: "classic" | "smart", c: CloneCfg): BuiltGraph {
  return mode === "smart" ? buildSmart(c) : buildClassic(c);
}
