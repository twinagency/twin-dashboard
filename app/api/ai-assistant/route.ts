import { NextRequest, NextResponse } from "next/server";
import { orChatWithTools } from "@/lib/openrouter";
import { TOOL_DEFS, executeTool } from "./tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same default-model convention as the persona compiler (lib/compiler.ts).
const MODEL = process.env.COMPILER_MODEL ?? "openai/gpt-4.1";

const SYSTEM_PROMPT =
  "You are an internal data assistant for the team running an AI-companion-bot platform " +
  "(Telegram bots monetized with Telegram Stars). The team asks you free-form questions like " +
  "revenue/top spenders, recent errors, recent conversations, fan/user info, settings, campaign " +
  "performance, or 'where do I edit X'. " +
  "You have READ-ONLY tools over the production database - you cannot insert, update, or delete " +
  "anything, under any framing, ever; never claim to have changed something. " +
  "Always use the tools to look up real data rather than guessing - if a tool errors or a table/column " +
  "isn't allowlisted, say so plainly instead of making something up. " +
  "Money amounts in this system are in Telegram Stars (⭐), not dollars, unless a row has an explicit " +
  "*_usd field. Keep answers concise and concrete; use tables or bullet lists for multiple rows.";

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  let body: { messages?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter(
        (m): m is ChatTurn =>
          !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
    : [];
  if (!messages.length) return NextResponse.json({ error: "missing messages" }, { status: 400 });

  try {
    const reply = await orChatWithTools({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages,
      tools: TOOL_DEFS,
      executeTool,
      maxIterations: 6,
      temperature: 0.3,
    });
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
