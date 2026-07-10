// The clone onboarding questionnaire. One source of truth: the form renders
// these fields and the server assembles the answers text the AI compiler reads.
// WHO SHE IS (sections 1-7) → her persona. WHAT SHE SELLS (section 8) is captured
// for reference but the runtime gates selling behind the feature toggles, so it
// never leaks when photos/videos are off.

export type IntakeField = {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
};

export type IntakeSection = {
  title: string;
  hint?: string;
  fields: IntakeField[];
};

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    title: "Basics",
    fields: [
      { key: "age", label: "Age", placeholder: "24" },
      { key: "location", label: "Where she's from / lives now", placeholder: "Aussie, lives in Miami" },
      { key: "occupation", label: "Her job (what she tells fans)", placeholder: "part-time fitness model + influencer" },
      { key: "look", label: "Her look in a line", placeholder: "tan, fit, long dark hair, beachy" },
    ],
  },
  {
    title: "Her real life",
    hint: "Makes the chat feel like a real person.",
    fields: [
      { key: "daily_routine", label: "A normal day for her", placeholder: "gym in the morning, beach, content, late-night chats", multiline: true },
      { key: "hobbies", label: "Hobbies & interests", placeholder: "surfing, true-crime podcasts, lingerie shopping" },
      { key: "likes", label: "Likes", placeholder: "spicy margaritas, hip-hop, attention" },
      { key: "dislikes", label: "Dislikes", placeholder: "rude guys, being ignored, cold weather" },
      { key: "living_situation", label: "Living situation / pets", placeholder: "lives alone with her cat Mango" },
      { key: "faves", label: "Music / food / shows she loves", placeholder: "hip-hop, sushi, true crime" },
      { key: "goals", label: "What she's saving for / her goals", placeholder: "travelling, a beach house one day" },
    ],
  },
  {
    title: "Social media",
    fields: [
      { key: "socials", label: "Her handles", placeholder: "IG @sophie, TikTok @sophie, OF /sophie" },
      { key: "socials_behavior", label: "How she answers 'what's your insta/OF?'", placeholder: "keeps him chatting here, teases instead of giving links", multiline: true },
    ],
  },
  {
    title: "How she talks",
    hint: "The single biggest thing for sounding like her.",
    fields: [
      { key: "texting_style", label: "Texting style", placeholder: "lowercase, short, lots of babe/baby, few emojis, never formal", multiline: true },
      { key: "voice_sound", label: "How she sounds out loud (for voice notes)", placeholder: "soft Aussie lilt, slightly raspy, slow and teasing" },
      { key: "nicknames", label: "Pet names she calls fans", placeholder: "babe, baby" },
      { key: "example_texts", label: "★ Real example texts from her (paste 5-10)", placeholder: "one per line — her actual messages. This matters most.", multiline: true },
    ],
  },
  {
    title: "Personality",
    fields: [
      { key: "traits", label: "3-5 personality traits", placeholder: "playful, bratty, cheeky, secretly sweet" },
      { key: "reactions", label: "How she reacts to compliments / being ignored / rude guys", placeholder: "deflects compliments, teases, goes quiet on rude guys", multiline: true },
      { key: "humor", label: "Her sense of humor", placeholder: "sarcastic, teasing, playful" },
    ],
  },
  {
    title: "Flirting & sexual style",
    fields: [
      { key: "flirt_style", label: "How she flirts", placeholder: "starts playful, escalates slowly, rewards attention", multiline: true },
      { key: "explicitness", label: "How explicit she gets", placeholder: "suggestive and confident, leans in when he does" },
      { key: "turn_ons", label: "Turn-ons", placeholder: "confidence, banter, being told what to do sometimes" },
      { key: "turn_offs", label: "Turn-offs", placeholder: "clinginess too early, one-word replies, bragging" },
      { key: "hard_limits", label: "★ Hard limits — never do/say", placeholder: "topics, words, or acts she will never do", multiline: true },
    ],
  },
  {
    title: "Relationship feel",
    fields: [
      { key: "relationship_status", label: "Single? How she answers 'are you single / do you love me / can we meet?'", placeholder: "single and into you; deflects meeting softly", multiline: true },
      { key: "relationship_vibe", label: "Her vibe", placeholder: "the flirty girlfriend / the tease / the domme" },
    ],
  },
  {
    title: "Content & selling",
    hint: "Captured for reference. Selling behavior is controlled by the feature switches, not this.",
    fields: [
      { key: "content_types", label: "What she sells", placeholder: "photos, videos, customs, sexting, bundles" },
      { key: "named_sets", label: "Named sets she teases", placeholder: "the shower set, beach lingerie set" },
      { key: "pushiness", label: "How pushy she is about selling", placeholder: "patient and playful, never salesy" },
    ],
  },
  {
    title: "Anything else",
    fields: [
      { key: "notes", label: "Anything else about her", placeholder: "backstory, inside jokes, stories she can drop naturally", multiline: true },
    ],
  },
];

export const INTAKE_FIELD_KEYS: string[] = INTAKE_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

// Build the labelled text blob the AI compiler reads, from the field values.
// `name` is the clone's display name (from the top of the form).
export function assembleAnswers(fields: Record<string, string>, name?: string): string {
  const labelFor = (key: string) =>
    INTAKE_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key)?.label ?? key;

  const lines: string[] = [];
  if (name) lines.push(`Name: ${name}`);
  for (const section of INTAKE_SECTIONS) {
    const present = section.fields.filter((f) => (fields[f.key] ?? "").trim());
    if (present.length === 0) continue;
    lines.push("", `## ${section.title}`);
    for (const f of present) lines.push(`${f.label.replace(/^★ /, "")}: ${fields[f.key].trim()}`);
  }
  return lines.join("\n").trim();
}
