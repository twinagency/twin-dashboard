"use client";

// A read-only n8n-style canvas of a clone's message pipeline. Pure view: it
// reflects whatever config it's handed and re-lays-out as those settings change.
// Reused wherever we want to show "how this clone thinks" (Configure now, Logs later).

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildGraph, type CloneCfg, type FlowData, type NodeKind } from "./graph";

const KIND_CLASS: Record<NodeKind, string> = {
  input: "border-accent/60 bg-accent/10 text-accent",
  process: "border-line bg-panel text-ink",
  decision: "border-warn/60 bg-warn/10 text-warn",
  lane: "border-info/50 bg-info/10 text-info",
  tool: "border-info/60 bg-info/15 text-info",
  sale: "border-good/60 bg-good/10 text-good",
  meter: "border-accent-2/60 bg-accent-2/10 text-accent-deep",
  paywall: "border-crit/50 bg-crit/10 text-crit",
  background: "border-dashed border-line bg-bg text-muted",
};

function FlowNode({ data }: NodeProps) {
  const d = data as FlowData;
  return (
    <div className={`min-w-[150px] max-w-[200px] rounded-lg border px-3 py-2 shadow-sm ${KIND_CLASS[d.kind]}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-current opacity-50" />
      <div className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
        {d.emoji && <span>{d.emoji}</span>}
        <span>{d.label}</span>
      </div>
      {d.sub && <div className="mt-0.5 text-[11px] opacity-70">{d.sub}</div>}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-current opacity-50" />
    </div>
  );
}

const nodeTypes = { flowNode: FlowNode };

export default function FlowGraph({ cfg }: { cfg: CloneCfg }) {
  // Show ONLY the clone's live flow — the real ai_mode, no peeking at the other.
  const mode = cfg.ai_mode;
  const { nodes, edges, hidden, active } = useMemo(() => buildGraph(mode, cfg), [mode, cfg]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/10 px-3 py-1 text-sm font-medium capitalize">
          {mode}
          <span className="text-[10px] text-accent">● live</span>
        </span>
        <p className="text-xs text-muted">
          {mode === "classic"
            ? "Sorter picks ONE lane per message."
            : cfg.smart_split
              ? "Writer + Decider (split): reply and tools chosen by two models."
              : "One model writes the reply and picks tools together."}
        </p>
      </div>

      <div className="h-[560px] w-full rounded-xl border border-line bg-bg">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesConnectable={false}
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
          className="rounded-xl"
        >
          <Background gap={18} className="!bg-transparent" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
        {active.length > 0 && (
          <div>
            <span className="font-medium text-muted">Modifiers on: </span>
            <span className="text-ink">{active.join(" · ")}</span>
          </div>
        )}
        {hidden.length > 0 && (
          <div>
            <span className="font-medium text-muted">Hidden (off): </span>
            <span className="text-muted line-through">{hidden.join(" · ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
