import { NextRequest } from "next/server";
import { orChatWithToolsStream } from "@/lib/openrouter";
import { TOOL_DEFS, executeTool } from "./tools";
import { WRITE_TOOL_DEFS, WRITE_TOOL_NAMES, executeWriteTool } from "./write-tools";
import { createConversation, appendMessage, getConversationMessages } from "./db";
import { CLONE_TOGGLE_FIELDS } from "@/app/clones/toggle-fields";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Same default-model convention as the persona compiler (lib/compiler.ts).
const MODEL = process.env.COMPILER_MODEL ?? "openai/gpt-4.1";

const SYSTEM_PROMPT =
  "You are an internal assistant for the team running an AI companion bot platform " +
  "(Telegram bots monetized with Telegram Stars). You can explain the data AND make certain " +
  "changes for the team, so iterating on the product does not require a developer in a terminal.\n\n" +
  "READS: you have tools to query the live database. They are strictly read-only, allowlisted to " +
  "specific tables and columns, hard capped at 200 rows per query. Some columns (bot tokens, third-party " +
  "API keys) are excluded entirely and no tool can return them. If a tool errors or something is not " +
  "allowlisted, say so plainly instead of guessing.\n\n" +
  "WRITES: you have a small, fixed set of write tools. Each one performs exactly ONE already-validated " +
  "action a person could already do from this dashboard (turn a named feature on/off for a clone, pause/" +
  "resume a clone, recompile a persona, move a feedback item, adjust or reset a fan's credits, activate/" +
  "deactivate or block/unblock a fan). There is no generic 'change this column' tool. If what's being " +
  "asked is not covered by one of your write tools, say plainly that you cannot do it from here and say " +
  "where in the dashboard it can be done instead - never claim to have changed something you have no " +
  "tool for. Never invent or compute a price, a Star amount, or a discount percentage - you may only " +
  "flip a feature's ON/OFF switch, the underlying numbers are set elsewhere and stay code-locked. Only " +
  "call a write tool when the user has clearly asked for a change; if it's ambiguous which clone or fan " +
  "they mean, ask first. After a write succeeds, state plainly and specifically what changed.\n\n" +
  "Money amounts in this system are Telegram Stars, not dollars, unless a row has an explicit *_usd " +
  "field. Keep answers concise and concrete, use tables or bullet lists for multiple rows. Never use em " +
  "dashes in your replies.\n\n" +
  "TEST RUNS: listTestRuns and getTestRun read past Test-section sim run history and transcripts, free to " +
  "call any time. startTestRun is different from every other write tool: it costs real money (real AI model " +
  "calls, real ElevenLabs calls if voice is on), small but real per call, and it is not reversible once " +
  "started. Before calling startTestRun, tell the user plainly that it costs real money, unless they've " +
  "already said to just go ahead and start one. Do not call it speculatively or 'just to check something' - " +
  "only when the user has clearly asked for a test run.\n\n" +
  "SETTINGS REVIEW: when asked to review, audit, or recommend settings for a clone, call queryTable on " +
  "clones for that one clone (every allowed column) so you see its full toggle and dial configuration in " +
  "one shot. Look for the same kind of contradiction the dashboard's own proactive suggestions already " +
  "flag (a voice_id set but voice_enabled off, discount caps set but discounts_enabled off, " +
  "subscription_tiers configured but subscriptions_enabled off, spoil_options set but tips_enabled off) " +
  "plus anything else your own judgment turns up across the rest of the toggle and dial columns " +
  "(sexual_level/nsfw_level/push_level, emoji settings, ai_mode/smart_split, models, welcome/paywall " +
  "instructions, etc). State each recommendation with a one-line reason, never just 'you should change X'. " +
  `Exactly these fields are ones you can actually flip yourself, with setCloneFeature, and only after the ` +
  `user confirms: ${CLONE_TOGGLE_FIELDS.join(", ")}. For every other column (dials like sexual_level/` +
  "nsfw_level/push_level/emoji_amount, ai_mode/smart_split, any *_model, any money field like " +
  "starting_credits/credit_pack_price_stars/discount_max_*, campaign or onboarding text, persona facts) " +
  "you have no write tool - recommend it in plain words and say specifically where in the dashboard to " +
  "change it (e.g. 'Configure > Personality & style', 'Configure > Credits & paywall', the Campaigns page), " +
  "never claim to have applied it. Never invent, recommend a specific number for, or apply any money value " +
  "- amounts are always the operator's call.";

const TOOL_LABELS: Record<string, string> = {
  queryTable: "Looking that up",
  getTopSpenders: "Checking top spenders",
  getRecentErrors: "Checking recent errors",
  setCloneFeature: "Updating a setting",
  setCloneStatus: "Updating clone status",
  recompileClonePersona: "Recompiling persona",
  updateFeedbackStatus: "Updating feedback item",
  setFanCredits: "Updating fan credits",
  setFanActive: "Updating fan status",
  setFanBlocked: "Updating fan block state",
  resetFanCounters: "Resetting fan counters",
  listTestRuns: "Checking test run history",
  getTestRun: "Reading test run transcript",
  startTestRun: "Starting a test run (real cost)",
};

const ALL_TOOL_DEFS = [...TOOL_DEFS, ...WRITE_TOOL_DEFS];

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (WRITE_TOOL_NAMES.has(name)) return executeWriteTool(name, args);
  return executeTool(name, args);
}

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: { conversationId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }

  const userMessage = (body.message ?? "").trim();
  if (!userMessage) return new Response(JSON.stringify({ error: "missing message" }), { status: 400 });

  let conversationId = body.conversationId ?? null;
  let history: { role: "user" | "assistant"; content: string }[] = [];

  try {
    if (conversationId) {
      const rows = await getConversationMessages(conversationId);
      history = rows.map((r) => ({ role: r.role, content: r.content }));
    } else {
      const convo = await createConversation(userMessage);
      conversationId = convo.id;
    }
    await appendMessage(conversationId!, "user", userMessage);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }), { status: 500 });
  }

  const finalConversationId = conversationId!;
  const messages = [...history, { role: "user" as const, content: userMessage }];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: Record<string, unknown>) => controller.enqueue(enc.encode(sse(event)));

      send({ type: "start", conversationId: finalConversationId });

      let assistantText = "";
      const toolsUsed = new Set<string>();
      const writes: { summary: string }[] = [];

      try {
        for await (const evt of orChatWithToolsStream({
          model: MODEL,
          system: SYSTEM_PROMPT,
          messages,
          tools: ALL_TOOL_DEFS,
          executeTool: dispatchTool,
          maxIterations: 8,
          temperature: 0.3,
        })) {
          if (evt.type === "token") {
            assistantText += evt.text;
            send({ type: "token", text: evt.text });
          } else if (evt.type === "tool_call") {
            toolsUsed.add(evt.name);
            send({ type: "tool_call", name: evt.name, label: TOOL_LABELS[evt.name] ?? "Working on it" });
          } else if (evt.type === "tool_result") {
            if (WRITE_TOOL_NAMES.has(evt.name)) {
              const result = evt.result as { ok?: boolean; summary?: string } | null;
              if (result?.ok && result.summary) {
                writes.push({ summary: result.summary });
                send({ type: "write", summary: result.summary });
              }
            }
          } else if (evt.type === "error") {
            send({ type: "error", message: evt.message });
          }
        }

        if (assistantText.trim()) {
          await appendMessage(finalConversationId, "assistant", assistantText, {
            tools: [...toolsUsed],
            writes,
          });
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "failed" });
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
