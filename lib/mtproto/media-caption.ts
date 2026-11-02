const MAX_MESSAGE_CHARS = 280;
const UNLOCK_PATTERN = /\bunlock/i;
const PAYMENT_PATTERN = /\b(stars?|pay|buy|purchase|price|\$\d|paid)\b/i;
const MEDIA_BAIT_PATTERN = /\b(locked|exclusive|private|secret|nude|naked|photo|pic|video|vid|content|bundle|sale|discount|offer|free)\b/i;

// Banned phrase/shape checks — a defensive net in case a future composer
// (the LLM seam above) tries to fabricate activity or apply pressure. Not
// exhaustive; it's a last-line check, not the policy itself.
const BANNED_PATTERNS: RegExp[] = [
  /\bi saw you\b/i,
  /\bi noticed you\b/i,
  /\bonly \d+ (left|spots|hours)\b/i,
  /\blast chance\b/i,
  UNLOCK_PATTERN,
  /\bfor a limited time\b/i,
  // fake urgency
  /\b(hurry|right now|today only|expires?|expiring|running out|act now|don'?t miss|before (it'?s|its) too late|last day|deadline|asap|urgent)/i,
  // pressure / guilt
  /\b(you owe|why (are|did) you (ignor|leav)|still waiting|left me on read|ignoring me|don'?t ignore|answer me|reply now|you promised)/i,
  // surveillance / "I see you reading"
  /\bi (see|can see|saw|noticed|watched|know) (you|that you)/i,
  /\b(read|seen|opened|viewed|online|watching|looked at)\b.{0,20}\b(my|the|your) (message|dm|chat|story|profile)/i,
  /\bi see you\b|\byou('re| are) (reading|online|looking)|\bsaw you (online|read|looking)/i,
  // locked-media / paid bait
  MEDIA_BAIT_PATTERN,
  PAYMENT_PATTERN,
  // links / handles / contact moves: payments stay on the bot, this text is plain
  /https?:|t\.me|www\.|@\w|\.com\b/i,
];

/** Last-line check on the final text (empty, too long, banned shapes). */
export function composeIsSafe(text: string): boolean {
  return validateMessage(text) === null;
}

/** Returns null when the text may be sent, else a short reason code. */
// Telegram's caption cap for media. Operator-approved campaign captions ride on
// a photo/video, so they may exceed the 280-char plain-message budget.
export const MAX_MEDIA_CAPTION_CHARS = 1024;

export function validateMessage(
  text: unknown,
  maxChars: number = MAX_MESSAGE_CHARS,
  opts: { freePicsCopy?: boolean; reviewedCampaignCopy?: boolean } = {},
): string | null {
  if (typeof text !== "string") return "not_a_string";
  const t = text.trim();
  if (t.length === 0) return "empty";
  if ((opts.reviewedCampaignCopy ? text.length : t.length) > maxChars) return "too_long";
  if (/\{\{|\}\}/.test(t)) return "unfilled_template";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e]/.test(t)) return "control_chars";
  if (opts.reviewedCampaignCopy && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(text)) return "control_chars";
  // Fan-facing copy never carries an em or en dash (owner rule).
  if ((opts.freePicsCopy || opts.reviewedCampaignCopy) && /[\u2013\u2014]/.test(t)) return "dash";
  const banned = opts.reviewedCampaignCopy ? BANNED_PATTERNS.filter((re) => ![MEDIA_BAIT_PATTERN, UNLOCK_PATTERN, PAYMENT_PATTERN].includes(re)) : opts.freePicsCopy ? BANNED_PATTERNS.filter((re) => re !== MEDIA_BAIT_PATTERN) : BANNED_PATTERNS;
  if (banned.some((re) => re.test(t))) return "banned_phrase";
  return null;
}

