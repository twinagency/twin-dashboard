import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { orChatWithToolsStream } from "@/lib/openrouter";
import { TOOL_DEFS, executeTool } from "./tools";
import { WRITE_TOOL_DEFS, WRITE_TOOL_NAMES } from "./write-tools";
import { NAV_TOOL_DEFS, NAV_TOOL_NAMES, resolveNavTool } from "./nav-tools";
import { describeProposal, type Proposal } from "./proposals";
import { createConversation, appendMessage, getConversationMessages, saveTurn } from "./db";
import { CLONE_TOGGLE_FIELDS, CLONE_DIAL_FIELDS } from "@/app/clones/toggle-fields";
import { trustedFormOrigin } from "@/lib/form-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Same default-model convention as the persona compiler (lib/compiler.ts).
const MODEL = process.env.COMPILER_MODEL ?? "openai/gpt-4.1";

const SYSTEM_PROMPT =
  "You are Twin, the assistant built into this dashboard for the team running an AI companion bot " +
  "platform (Telegram bots monetized with Telegram Stars). You explain the data, open pages, and " +
  "propose changes, so iterating on the product does not need a developer in a terminal.\n\n" +
  // HOW YOU TALK comes first deliberately. It used to be one clause buried in a
  // paragraph near the bottom ("keep answers concise and concrete") and the
  // assistant wrote long, hedged, repetitive replies anyway. Same lesson as the
  // bot's reply-length fix on 2026-07-31: a rule the model has to dig for is a
  // rule it does not follow. This one is first, concrete, and has examples.
  "HOW YOU TALK - THIS MATTERS AS MUCH AS BEING RIGHT:\n" +
  "Short. Sharp. Like a smart colleague leaning over, not a report.\n" +
  "- Default to ONE OR TWO SENTENCES. A number and the thing it means is a complete answer.\n" +
  "- Lead with the answer. Never open with 'Great question', 'Sure!', 'Let me check', 'I'd be happy to', " +
  "or by restating what was asked.\n" +
  "- No preamble, no summary of what you just said, no 'let me know if you need anything else'.\n" +
  "- Only go longer when genuinely asked to compare, audit, or list several rows, and then use a tight " +
  "table or bullets, never prose paragraphs.\n" +
  "- Say the uncomfortable thing plainly. 'Voice is off for Aria, that's why' beats a hedged paragraph.\n" +
  "- If you don't know or a tool failed, say so in one line. Never pad around it.\n" +
  "Good: 'Aria. 4,210 Stars this week, about 2x the next one.'\n" +
  "Bad: 'Great question! I checked the data and it looks like Aria is currently the top performer, " +
  "having earned approximately 4,210 Stars over the past week, which is roughly double...'\n\n" +
  "NAVIGATION: you can open dashboard pages yourself with openPage / openClonePage. If the useful " +
  "answer is 'go look at X', OPEN X instead of describing where it lives, then say one line about what " +
  "they're looking at. Opening a page changes nothing and needs no confirmation.\n\n" +
  "READS: you have tools to query the live database. They are strictly read-only, allowlisted to " +
  "specific tables and columns, hard capped at 200 rows per query. Some columns (bot tokens, third-party " +
  "API keys) are excluded entirely and no tool can return them. If a tool errors or something is not " +
  "allowlisted, say so plainly instead of guessing.\n\n" +
  "WRITES ARE PROPOSALS, NOT ACTIONS. You have a small fixed set of write tools (turn a named feature " +
  "on/off for a clone, move one tone/behavior dial to a specific step, pause/resume a clone, recompile a " +
  "persona, adjust or reset a fan's credits, activate/deactivate or block/unblock a fan). Calling one does " +
  "NOT change anything: it puts an approval card in front of the operator and waits. Nothing is applied " +
  "until they press Approve. So after calling a write tool, say in ONE line what you've queued and that it " +
  "needs their tap - never say you have changed, turned on, or updated anything, because at that moment you " +
  "have not. There is no generic 'change this column' tool; if a change isn't covered, say so in one line and " +
  "open or name the page where it is done. Never invent or compute a price, a Star amount, or a discount " +
  "percentage - you may only flip a feature's ON/OFF switch or move a tone/behavior dial to one of its named " +
  "steps, the money numbers are set elsewhere and stay code-locked. If it's ambiguous which clone or fan they " +
  "mean, ask before proposing.\n\n" +
  "Money amounts in this system are Telegram Stars, not dollars, unless a row has an explicit *_usd " +
  "field. Never use em dashes in your replies.\n\n" +
  "MONEY AND INSIGHT QUESTIONS ARE ANSWERED ONLY WHEN ASKED. Diagnostic or recommendation answers (what's " +
  "wrong, what dial to change, who's underperforming, what looks misconfigured) are Q&A only: use the read " +
  "tools (queryTable, getTopSpenders, getRecentErrors, system_logs, usage_events) to answer an explicit " +
  "question like that, but never volunteer a diagnosis, a recommendation, or a money observation unprompted " +
  "in a reply about something else.\n\n" +
  // The TEST RUNS paragraph was removed on 2026-07-31 with the last of the
  // test-run tools. Leaving it in told the model that three tools it does not
  // have are available, which is how a model ends up promising the user a run
  // it cannot start.
  "SETTINGS REVIEW: when asked to review, audit, or recommend settings for a clone, or asked directly " +
  "whether anything conflicts or interacts badly, call checkDialConflicts for that clone FIRST. It runs the " +
  "exact same dial-conflict rules the Configure page's own warning cards use (discounts enabled with every " +
  "cap at 0%, bubble delay max below min, the recovery-line cooldown being a no-op while that line is off, " +
  "the absolute discount ceiling undercutting a category cap, spend-tier thresholds out of order, max " +
  "NSFW/flirtiness paired with silence on failure). Report back exactly what it returns, that rule's text " +
  "and detail verbatim, nothing paraphrased or invented. An empty result means nothing conflicts right now, " +
  "say so plainly rather than manufacturing a finding. Then also call queryTable on clones for that one " +
  "clone (every allowed column) so you see its full toggle and dial configuration in one shot, and look for " +
  "the same kind of contradiction the dashboard's own proactive suggestions already flag (a voice_id set " +
  "but voice_enabled off, discount caps set but discounts_enabled off, spoil_options set but tips_enabled " +
  "off) plus anything else your own judgment turns up across the rest of the toggle and dial columns " +
  "(sexual_level/nsfw_level/push_level, emoji settings, ai_mode/smart_split, models, welcome/paywall " +
  "instructions, etc), clearly separated from the checkDialConflicts findings so the operator can tell a " +
  "known rule from your own read of the row. State each recommendation with a one-line reason, never just " +
  "'you should change X'. " +
  `Exactly these fields are ones you can propose flipping, with setCloneFeature: ` +
  `${CLONE_TOGGLE_FIELDS.join(", ")}. Exactly these fields are ones you can propose moving to a new step, ` +
  `with setCloneDial (each has its own fixed allowed values, given in that tool's schema): ` +
  `${Object.keys(CLONE_DIAL_FIELDS).join(", ")}. For every other column (ai_mode/smart_split, any *_model, ` +
  "any money field like starting_credits/credit_pack_price_stars/discount_max_*, campaign or onboarding " +
  "text, persona facts) you have no write tool - recommend it in plain words and say specifically where in " +
  "the dashboard to change it (e.g. 'Configure > Personality & style', 'Configure > Credits & paywall', the " +
  "Campaigns page), never claim to have applied it. Never invent, recommend a specific number for, or apply " +
  "any money value - amounts are always the operator's call.";

// Labels for write tools now describe PROPOSING, not doing. "Updating a
// setting" while nothing is being updated is exactly the kind of small lie that
// makes an operator trust an approval card less than they should.
const TOOL_LABELS: Record<string, string> = {
  queryTable: "Looking that up",
  getTopSpenders: "Checking top spenders",
  getRecentErrors: "Checking recent errors",
  checkDialConflicts: "Checking for setting conflicts",
  openPage: "Opening it",
  openClonePage: "Opening it",
  setCloneFeature: "Preparing a setting change",
  setCloneDial: "Proposing a dial change",
  setCloneStatus: "Preparing a status change",
  recompileClonePersona: "Preparing a persona recompile",
  setFanCredits: "Preparing a credit change",
  setFanActive: "Preparing a fan status change",
  setFanBlocked: "Preparing a block change",
  resetFanCounters: "Preparing a counter reset",
};

const ALL_TOOL_DEFS = [...TOOL_DEFS, ...WRITE_TOOL_DEFS, ...NAV_TOOL_DEFS];

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// Code-enforced backstop for the "never use em dashes" rule in SYSTEM_PROMPT
// above. Prompt rules on this project have been measured to not hold on their
// own (dials, anti-fabrication and the money rule are all ignored some of the
// time), so this cannot depend on the model obeying it. Deliberately run ONCE
// over the whole assembled message, never per-token: an em dash character
// itself can't split across streamed chunks, but the surrounding whitespace
// pattern (" — ") can, and a per-token replace could miss it or double-replace
// a partial match. See the `correction` SSE event below, sent once per
// completed assistant turn.
function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/—/g, ", ");
}

export async function POST(req: NextRequest) {
  // Same-origin only (lib/form-origin.ts): a cross-origin text/plain POST needs no preflight and costs a model call.
  if (!trustedFormOrigin(req)) return Response.json({ error: "origin not allowed" }, { status: 403 });
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
      const proposals: Proposal[] = [];
      // This turn's assistant row: created at the first proposal, so every card the operator sees is stored
      // (and approvable) even while the turn is still streaming or if it later errors.
      let turnId: string | null = null;
      const persistTurn = async () => {
        turnId = await saveTurn(finalConversationId, turnId, assistantText, { tools: [...toolsUsed], writes, proposals });
      };

      // Per-request so it can push proposals and navigations onto THIS stream.
      //
      // The write branch is the approval gate: it never calls executeWriteTool.
      // executeWriteTool is not even imported into this file any more, so the
      // gate cannot be undone by an accidental edit here - you would have to
      // add the import back on purpose.
      const dispatchTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
        if (WRITE_TOOL_NAMES.has(name)) {
          const { summary, heavy } = describeProposal(name, args);
          const proposal: Proposal = { id: randomUUID(), tool: name, args, summary, heavy };
          proposals.push(proposal);
          try {
            await persistTurn();
          } catch (e) {
            proposals.pop();
            console.error("[ai-assistant] could not store a proposal", e);
            return {
              status: "not_queued",
              applied: false,
              note: `NOT APPLIED and NOT QUEUED: the proposal for "${summary}" could not be saved, so no approval card was shown. Tell the operator that in one line.`,
            };
          }
          send({ type: "proposal", ...proposal });
          // What the MODEL is told. Worded so it cannot reasonably narrate this
          // as a completed change, and so it stops rather than trying again.
          return {
            status: "awaiting_approval",
            applied: false,
            note: `NOT APPLIED. An approval card for "${summary}" is now in front of the operator. Tell them in one line what is waiting and that it needs their tap. Do not call this tool again.`,
          };
        }

        if (NAV_TOOL_NAMES.has(name)) {
          const nav = resolveNavTool(name, args);
          if (nav.error) return { ok: false, error: nav.error };
          send({ type: "navigate", path: nav.path, label: nav.label });
          return { ok: true, opened: nav.path };
        }

        return executeTool(name, args);
      };

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
            // Nothing to report here for writes any more: a write tool call
            // produces a proposal (emitted above at dispatch time) and no
            // change, so there is no "write" event until /approve runs one.
          } else if (evt.type === "error") {
            send({ type: "error", message: evt.message });
          }
        }

        // One pass, once, over the whole completed message - see stripEmDashes
        // above for why this isn't done per-token. If the model ignored the
        // prompt's "never use em dashes" rule, the client is told to swap in
        // the cleaned text instead of trusting what already streamed.
        const cleaned = stripEmDashes(assistantText);
        if (cleaned !== assistantText) {
          assistantText = cleaned;
          send({ type: "correction", text: cleaned });
        }

        // Final text onto the row the first proposal created, or a new row for a text-only turn.
        if (assistantText.trim() || turnId) await persistTurn();
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
