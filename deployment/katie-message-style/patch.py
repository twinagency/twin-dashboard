"""Apply the reviewed Katie-only overlay to a copy of the running V2 source.

Usage: python3 patch.py STAGING_ROOT
The original image remains the rollback artifact. Every replacement is asserted.
"""
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
here = pathlib.Path(__file__).resolve().parent
changed = []

def edit(name, replacements):
    p = root / name
    data = p.read_text()
    for before, after, count in replacements:
        assert data.count(before) == count, (name, before[:100], data.count(before), count)
        data = data.replace(before, after)
    p.write_text(data)
    changed.append(name)

def add(name, source):
    p = root / name
    assert not p.exists(), name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text((here / source).read_text())
    changed.append(name)

add("src/conversation-style.ts", "conversation-style.ts")

edit("src/girls/index.ts", [
    ('import { riley }', 'import { conversationSettings, type ConversationSettings } from "../conversation-style.js";\nimport { riley }', 1),
    ('  cloneId: string;', '  conversation?: ConversationSettings;\n  cloneId: string;', 1),
    ('getVars: () => GirlVars): Girl {', 'getVars: () => GirlVars, getConversation: () => ConversationSettings | undefined = () => conversationSettings(row)): Girl {', 1),
    ('    mediaSettings: mediaSettings(row),', '    mediaSettings: mediaSettings(row),\n    get conversation() { return getConversation(); },', 1),
    ('creatorRenderOpts(row.slug));', '{ ...creatorRenderOpts(row.slug), creatorId: row.id });', 1),
    ('creatorRenderOpts(row.slug, opts)),', '{ ...creatorRenderOpts(row.slug, opts), creatorId: row.id }),', 1),
])

old_case = '- you text like a real girl on her phone: ALL lowercase, always, even "i" and names. loose punctuation, often no full stop at the end, sometimes a missing apostrophe (im, dont, thats, youre), u / ur / rn / tho / gonna / wanna / kinda, and the odd small typo or grammar slip. never perfect grammar.'
old_length = '- ONE text per reply, no line breaks, short like real texts: usually 1 or 2 short sentences. when its sexual, up to 3. never an essay, never a list, never several messages.'
import json
helper = '''function creatorTemplate(vars: Partial<Record<string, string>>, opts: RenderOpts): string {
  const template = templateForVars(vars);
  if (!isKatie(opts.creatorId)) return template;
  return template
    .replace(OLD_CASE, "- Use correct British English grammar, spelling, capitalisation and punctuation by default. Follow the rare grammar-slip and sign-off frequencies in your personality preferences. Keep your casual voice and natural contractions.")
    .replace(OLD_LENGTH, "- Follow your individual reply-length preferences. Let the conversation determine the length: a few words, one sentence, or a fuller reply when needed. Do not pad replies, repeat a fixed sentence count, or add a question to every reply.")
    .replace("Both parts are sent together as one message, reply first.", "For a selected attachment, reply and caption stay together, reply first.");
}

'''.replace('OLD_CASE', json.dumps(old_case)).replace('OLD_LENGTH', json.dumps(old_length))
edit("src/girls/template.ts", [
    ('export type RenderOpts = {', 'export type RenderOpts = { creatorId?: string;', 1),
    ('export function render(vars:', helper + 'export function render(vars:', 1),
    ('withSales(templateForVars(vars), opts.sales,', 'withSales(creatorTemplate(vars, opts), opts.sales,', 3),
])
p = root / "src/girls/template.ts"
p.write_text('import { isKatie } from "../conversation-style.js";\n' + p.read_text())

edit("src/fleet.ts", [
    ('import fs from', 'import { CONVERSATION_COLUMNS, conversationSettings, type ConversationSettings } from "./conversation-style.js";\nimport fs from', 1),
    ('const optional = ["v2_credits_enabled"', 'const optional = [...CONVERSATION_COLUMNS, "v2_credits_enabled"', 1),
    ('  const vars = new Map<string, GirlVars>();', '  const vars = new Map<string, GirlVars>();\n  const conversations = new Map<string, ConversationSettings | undefined>();', 1),
    ('girlFromRow(row, () => vars.get(row.slug)!);', 'girlFromRow(row, () => vars.get(row.slug)!, () => conversations.get(row.slug));', 1),
    ('      vars.set(row.slug, row.v2_vars!);', '      vars.set(row.slug, row.v2_vars!);\n      conversations.set(row.slug, conversationSettings(row));', 1),
])

edit("src/runner.ts", [
    ('import fs from', 'import { isKatie } from "./conversation-style.js";\nimport fs from', 1),
    ('type Batch = { lines: string[];', 'type Batch = { receivedAt?: number; lines: string[];', 1),
    ('const job: Job = { chatId, who: b.who,', 'const job: Job = { chatId, receivedAt: b.receivedAt, who: b.who,', 1),
    ('      b.lines.push(text);', '      b.lines.push(text);\n      if (isKatie(d.girl.cloneId)) b.receivedAt = d.now();', 1),
    ('lowercase forced, emojis and dashes stripped', 'creator-specific casing, emoji policy and dashes cleaned', 1),
])

edit("src/turn.ts", [
    ('import { applyEmojiPolicy, isMaleCreator }', 'import { isKatie } from "./conversation-style.js";\nimport { applyEmojiPolicy, isMaleCreator }', 1),
    ('  text?: Attempt; //', '  bubbles?: { text: string; attempt: Attempt; historyWrite?: WriteResult }[]; // each plain conversation bubble, including partial delivery\n  text?: Attempt; //', 1),
    ('''    return dropThrowBack(applyEmojiPolicy(cleanReply(withoutPrompt), girl.vars.EMOJIS)
      .replace(new RegExp(`^\\\\s*${girl.name}\\\\s*:\\\\s*`, "gim"), "").toLowerCase());''', '''    const cleaned = applyEmojiPolicy(cleanReply(withoutPrompt), girl.vars.EMOJIS)
      .replace(new RegExp(`^\\\\s*${girl.name}\\\\s*:\\\\s*`, "gim"), "");
    return dropThrowBack(isKatie(girl.cloneId) ? cleaned : cleaned.toLowerCase());''', 1),
    ('// ONE message per reply, never a burst: her lines are joined into a single text.', '// Validate a complete reply first. The delivery owner may split Katie plain conversation at sentence boundaries.', 1),
])

edit("dashboard/server.ts", [
    ('renderParts(vars, new Date(), salesRenderOpts(salesMode))', 'renderParts(vars, new Date(), { ...salesRenderOpts(salesMode), creatorId: girl.cloneId })', 1),
    ('previewParts(vars ?? {}, new Date(), salesRenderOpts(salesMode))', 'previewParts(vars ?? {}, new Date(), { ...salesRenderOpts(salesMode), creatorId: row.id })', 1),
    ('renderParts(v, new Date(), salesRenderOpts(salesMode))', 'renderParts(v, new Date(), { ...salesRenderOpts(salesMode), creatorId: row.id })', 1),
])

conversation_send = '''
/** Katie's ordinary conversation only. Each acknowledged bubble has its own durable
 * intent and history commit; the original turn receives at most one credit charge.
 * Media, tips, invitations and fixed recovery lines keep their existing send path. */
async function sendConversation(c: Ctx, parts: string[], settings: ConversationSettings) {
  if (parts.length === 1) return sendTextTurn(c, parts[0]);
  const current = () => c.current() && (!c.job.salesRouteCurrent || c.job.salesRouteCurrent());
  c.delivery.bubbles = [];
  let first: Attempt | undefined;
  for (let i = 0; i < parts.length; i++) {
    if (i && !await waitWhileCurrent(randomDelay(settings.bubbleMinMs, settings.bubbleMaxMs), c.d.wait, current)) {
      cancelled(c, "between conversation bubbles"); break;
    }
    if (!current()) { cancelled(c, "before conversation bubble"); break; }
    // Recovery validates prepared.reply against the exact outbound payload.
    c.d.intake?.prepared({ fanId: c.chatId, epoch: c.job.epoch, route: c.job.route, turnId: c.rec.turnId, reply: parts[i], assetKeys: [] });
    await sendTextTurn(c, parts[i], i === 0);
    const attempt = c.delivery.text!;
    c.delivery.bubbles.push({ text: parts[i], attempt, ...(attempt.status === "acknowledged" ? { historyWrite: c.delivery.historyWrite?.reply } : {}) });
    first ??= attempt;
    // Existing credit/tip readers see the first acknowledged text even if a later
    // bubble is rejected or unconfirmed. Detailed outcomes remain above.
    c.delivery.text = first;
    if (attempt.status !== "acknowledged" || c.delivery.historyWrite?.reply?.ok === false) break;
  }
}

'''
edit("src/deliver.ts", [
    ('import { createHash, randomUUID }', 'import { isKatie, conversationBubbles, randomDelay, waitWhileCurrent, type ConversationSettings } from "./conversation-style.js";\nimport { createHash, randomUUID }', 1),
    ('export type Job = {', 'export type Job = {\n  receivedAt?: number; // latest merged input arrival, before generation and queue waits', 1),
    ('async function sendTextTurn(c: Ctx, text: string) {', 'async function sendTextTurn(c: Ctx, text: string, charge = true) {', 1),
    ('if (c.job.onTextAcknowledged && !c.delivery.fixedLine', 'if (charge && c.job.onTextAcknowledged && !c.delivery.fixedLine', 1),
    ('/** Check only existing inventory, ownership and sales state;', conversation_send + '/** Check only existing inventory, ownership and sales state;', 1),
    ('  const restricted = !contentAllowed(c.chatId, job.epoch);', '  const restricted = !contentAllowed(c.chatId, job.epoch);\n  const conversation = isKatie(d.girl.cloneId) ? d.girl.conversation : undefined;\n  const replyDue = conversation ? (job.receivedAt ?? d.now()) + randomDelay(conversation.waitMinMs, conversation.waitMaxMs) : undefined;', 1),
    ('  await d.wait(Math.min(4000, 600 + text.length * 20)); // typing time', '''  if (replyDue !== undefined) {
    if (!await waitWhileCurrent(replyDue - d.now(), d.wait, c.current)) { cancelled(c, "during reply pacing"); return r; }
  } else await d.wait(Math.min(4000, 600 + text.length * 20)); // existing creators' typing time''', 1),
    ('  else if (text) await sendTextTurn(c, text);', '''  else if (text) {
    if (conversation && !r.fallback && !r.invalid && !r.tipInvite && !tipPlan && !rec.contentOutcome?.invited && !c.salesAction) {
      const parts = conversationBubbles(text, conversation);
      r.bubbles = parts;
      await sendConversation(c, parts, conversation);
    } else await sendTextTurn(c, text);
  }''', 1),
])

add("scripts/check-katie-conversation.ts", "check-katie-conversation.ts")
(root / "katie-changed-files.json").write_text(json.dumps(changed, indent=2) + "\n")
print(json.dumps({"changed": changed}))
