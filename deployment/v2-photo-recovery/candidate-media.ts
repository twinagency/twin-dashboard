import { config } from "./config.js";

// Her catalogue, read once at startup from the live tables. READ ONLY: this file never writes to Supabase.
export type Item = {
  key: string; // "photo:<id>" or "video:<id>", used for the sent list and file-id cache
  kind: "photo" | "video";
  storagePath: string;
  words: Set<string>; // searchable words from visual facts / description (negated clauses removed) + consistent tags (same-thing slang folded to one word); never the caption
  related: Set<string>; // Stage 3: words only NEARBY to a requested attribute (a towel for "shower"): suggests it, never proves it
  label: string; // short neutral description, saved to history so she knows what he saw
  desc: string; // longer description shown to her in the menu before she sends
  explicitness: string; // none | suggestive | explicit
  stars: number; // its live price (star_value): what the locked paid post costs
  analysis?: AnalysisState; // legacy | pending | analysed | needs_review | failed: only a trusted row's words can be an exact match
  isFree?: boolean; // marked free in her catalogue (is_free): the only items that may go out unlocked
};

// Words people use to ask or chat, not to describe a file. Stage 3: "have", "any", "send" ... used to match descriptions that happened
// to contain them, and tied with (or beat) the attribute he actually asked for.
const STOP = new Set(("a an the and or of in on at to with for my me you your i is are this that it its her she person woman girl their they them wearing wears photo pic picture video baby babe u " +
  "have has had having any some got get gets can could would should will wont shall might may please pls plz send show see share give gimme want wanna need like love just more another other one ones same " +
  "lol lmao haha yes yeah yep nope okay what how when where who why now then here there about not dont cant youre ive ill thats whats been being but all too very really also still even much many " +
  "from out off over into than them him his hers our ours let lets sure look looks looking " +
  // greetings, compliments and time words: chat, not a request for something a file shows
  "hey hii hello good great nice bet always today tonight tomorrow yesterday morning amazing awesome cute cutie pretty gorgeous beautiful hot sexy omg honestly literally").split(" "));
// Fan slang and catalogue wording for the SAME thing, mapped to one word, so "booty" finds a photo described as "ass".
const SAME: Record<string, string> = Object.fromEntries(Object.entries({
  ass: "booty butt bum buns ass backside behind",
  boobs: "tits tit titties boobs boob breasts breast rack",
  nude: "naked nude nudes undressed",
  lingerie: "lingerie underwear panties panty bra thong knickers",
  bikini: "bikini bikinis swimsuit swimwear",
  pool: "pool poolside",
  gym: "gym",
  shower: "shower showers",
  bed: "bed",
  feet: "feet foot toes soles",
  legs: "legs leg",
  selfie: "selfie selfies",
  dress: "dress dresses",
  stairs: "stairs staircase steps stair",
  horse: "horse horses",
  nipples: "nipple nipples areola areolas",
  genitals: "genitals genitalia pussy vulva vagina cunt",
}).flatMap(([canon, list]) => list.split(" ").map((w) => [w, canon])));
// Stage 3: NEARBY words. They suggest the attribute but do not prove the file shows it: a towel is not a shower, a bedroom is not a bed,
// topless is not nude, a workout is not the gym. A hit here ranks below a real match and never counts as an exact match.
const RELATED: Record<string, string> = Object.fromEntries(Object.entries({
  shower: "bath bathtub towel",
  bed: "bedroom sheets pillow",
  nude: "topless bare",
  lingerie: "corset bodysuit",
  bikini: "swimming",
  gym: "workout exercise fitness training",
  selfie: "mirror",
  dress: "skirt",
  legs: "thighs",
  horse: "riding",
  boobs: "chest cleavage",
}).flatMap(([canon, list]) => list.split(" ").map((w) => [w, canon])));
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
export const words = (s: string) => new Set(tokens(s).map((w) => SAME[w] ?? w));
/** Words in `s` that are only NEARBY to an attribute (see RELATED), as that attribute. */
export const relatedWords = (s: string) => new Set(tokens(s).filter((w) => !(w in SAME) && w in RELATED).map((w) => RELATED[w]));

// ---------- what a row may claim (media-analysis fix) ----------
// Only visible facts are evidence. The sales caption is NEVER evidence. A negated clause ("nipples not visible") never is either.
// Facts (visual_facts.evidence, only "yes" counts) map onto the same canonical words a fan's request is folded to.
const FACT_WORDS: Record<string, string> = {
  nipples: "nipples topless boobs", genitals: "genitals", anus: "anus anal", bare_buttocks: "ass buttocks", full_nudity: "nude",
  sexual_activity: "sex sexual", sex_toy: "toy", swimwear: "bikini", lingerie: "lingerie", mirror_reflection: "mirror", suggestive_pose: "pose",
};
// A tag speaks for a fact key; a tag whose fact is not "yes" (or whose fact a clause denies) is stale and never establishes a match.
const TAG_FACT: Record<string, string> = {
  topless: "nipples", nipples: "nipples", nipple: "nipples", pussy: "genitals", vulva: "genitals", vagina: "genitals", genitals: "genitals", cunt: "genitals",
  anal: "anus", anus: "anus", ass: "bare_buttocks", butt: "bare_buttocks", buttocks: "bare_buttocks", booty: "bare_buttocks",
  nude: "full_nudity", naked: "full_nudity", full_nude: "full_nudity", fullnude: "full_nudity", full_nudity: "full_nudity",
  sex: "sexual_activity", sex_toy: "sex_toy", toy: "sex_toy", dildo: "sex_toy", vibrator: "sex_toy", plug: "sex_toy", butt_plug: "sex_toy",
  bikini: "swimwear", swimwear: "swimwear", lingerie: "lingerie", mirror_selfie: "mirror_reflection",
};
// Canonical words a request can name that this code can describe, whether or not any file shows them: an ask for nipples when no file does is
// an unavailable request, not "nothing specific".
const ATTR_CANON = new Set(["nipples", "boobs", "topless", "genitals", "anus", "anal", "ass", "nude", "lingerie", "bikini", "toy", "plug", "dildo", "vibrator", "wand", "mirror"]); // body/garment attributes only: chat words (sex, pose, dress...) count only when a file has them
// Every other spelling of the same thing (SAME groups: tits/boobs/breasts/titties/tit, bum/buns/backside, underwear/bra/thong, swimsuit...) speaks for the
// same fact key as its canonical word. "chest" and "areola(s)" are not in SAME as nipples/boobs but assert the same visible fact.
const CANON_FACT: Record<string, string> = { boobs: "nipples", nipples: "nipples", genitals: "genitals", ass: "bare_buttocks", nude: "full_nudity", lingerie: "lingerie", bikini: "swimwear", mirror: "mirror_reflection", chest: "nipples", sex_toys: "sex_toy", toys: "sex_toy", wand: "sex_toy", sextoy: "sex_toy" };
const tagKey = (t: string) => {
  const k = t.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return TAG_FACT[k] ?? CANON_FACT[SAME[k] ?? k];
};
// A confirmed GENERIC toy (sex_toy=yes: only the word "toy") is a relevant ALTERNATIVE for a request for one of these specific objects: it ranks like a nearby
// word (above unrelated files), is marked closest-available with "does not show: <object>", and is never an exact match (it lacks the word).
const SPECIFIC_TOY = new Set(["plug", "dildo", "vibrator", "wand"]);
const NEG = /\b(not|no|neither|nor|without|never|cannot|covered|covering|covers|hidden|obscured|concealed|blocked|cropped)\b|out of frame|n't\b|\bcant\b/i;
/** Clauses of a description (NOT split at commas: "The nipples, vagina, and anus are not visible" is one negated clause): split at sentence/semicolon, "but"/"while"/"although"/"whereas", and "and" before a new subject, so "...nude and her nipples are not visible" keeps "nude". */
const clauses = (s: string) => (s ?? "").split(/[.;!?\n]+|\b(?:but|while|although|whereas)\b|\band\b(?=\s+(?:her|his|their|the|she|he|they|a|an|no|not)\b)/i).map((c) => c.trim()).filter(Boolean);
/** The description with every negated clause removed, plus the fact keys those clauses deny. */
export function affirmed(desc: string): { text: string; denied: Set<string> } {
  const keep: string[] = [], denied = new Set<string>();
  for (const c of clauses(desc)) {
    if (!NEG.test(c)) { keep.push(c); continue; }
    const cw = words(c);
    for (const w of c.toLowerCase().replace(/[^a-z0-9_ ]+/g, " ").split(/\s+/)) { const k = tagKey(w); if (k) denied.add(k); }
    for (const [k, v] of Object.entries(FACT_WORDS)) if (v.split(" ").some((x) => cw.has(SAME[x] ?? x))) denied.add(k);
  }
  return { text: keep.join(". "), denied };
}
/** Searchable words of a free description with its negated clauses removed ("nipples not visible" does not name nipples). */
export const affirmedWords = (desc: string) => words(affirmed(desc).text);

export type AnalysisState = "legacy" | "pending" | "analysed" | "needs_review" | "failed";
/** The state a row's words may be trusted at. A failed/pending/needs_review row is never an exact match for anything. */
export function analysisState(r: any): AnalysisState {
  const st = r?.analysis_status;
  return st === "pending" || st === "failed" || st === "needs_review" || st === "analysed" ? st : "legacy";
}
const isFacts = (f: any): f is { evidence: Record<string, string>; visible?: string[] } => !!f && typeof f === "object" && f.v === 2 && !!f.evidence && typeof f.evidence === "object";

/** `tags` (any list, e.g. a bundle item's own) with every tag dropped that asserts a fact the row's analysis does not confirm (or its prose denies). */
export function tagsConsistentWith(r: any, tags: string[]): string[] {
  if (isFacts(r?.visual_facts)) { const ev = r.visual_facts.evidence; return tags.filter((t) => { const k = tagKey(t); return !k || ev[k] === "yes"; }); }
  const { denied } = affirmed(r?.visual_description ?? "");
  return tags.filter((t) => { const k = tagKey(t); return !k || !denied.has(k); });
}

/** The words, kept tags and state a stored row is allowed to match on. The caption (promotional text) is never read here. */
export function evidenceOf(r: any): { text: string; tags: string[]; state: AnalysisState; trusted: boolean } {
  const state = analysisState(r), tags: string[] = Array.isArray(r.tags) ? r.tags : [];
  if (state === "pending" || state === "failed" || state === "needs_review") return { text: "", tags: [], state, trusted: false };
  if (isFacts(r.visual_facts)) {
    const ev = r.visual_facts.evidence;
    const yes = Object.keys(FACT_WORDS).filter((k) => ev[k] === "yes");
    const kept = tags.filter((t) => { const k = tagKey(t); return !k || ev[k] === "yes"; });
    const visible = Array.isArray(r.visual_facts.visible) ? r.visual_facts.visible.filter((x: any) => typeof x === "string") : [];
    return { text: [...yes.map((k) => FACT_WORDS[k]), ...visible, ...kept, ...kept.map((t) => t.replace(/_/g, " "))].join(" "), tags: kept, state, trusted: true };
  }
  // legacy: description without its negated clauses; a tag a negated clause contradicts is dropped
  const { text, denied } = affirmed(r.visual_description ?? "");
  const kept = tags.filter((t) => { const k = tagKey(t); return !k || !denied.has(k); });
  return { text: `${kept.join(" ")} ${kept.join(" ").replace(/_/g, " ")} ${text}`, tags: kept, state, trusted: true };
}

/** Live upload paths are "<clone>/<type>/<Date.now()>-<file>"; the same file uploaded twice differs only in the prefix. */
export const baseName = (p: string) => p.replace(/^.*\//, "").replace(/^[0-9]{10,}-/, "").toLowerCase();

function firstSentence(s: string): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).slice(0, 140);
}

export function dedupe(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const b = baseName(r.storage_path);
    if (seen.has(b)) return false;
    seen.add(b);
    return true;
  });
}

const BASE_COLS = "id,storage_path,caption,tags,visual_description,explicitness,star_value,is_free,created_at";
const FACT_COLS = "analysis_status,visual_facts";
export async function rest(table: string, cloneId: string): Promise<any[]> {
  const get = (cols: string) => fetch(`${config.supabaseUrl}/rest/v1/${table}?select=${cols}&clone_id=eq.${cloneId}&order=created_at.asc`, {
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  let res = await get(`${BASE_COLS},${FACT_COLS}`);
  if (!res.ok) {
    const body = await res.text();
    // The migration may land after this code: a missing column falls back to the old select (every row is then "legacy").
    if (res.status >= 400 && res.status < 500 && /42703|PGRST204|does not exist|column/i.test(body)) res = await get(BASE_COLS);
    else throw new Error(`supabase ${table} ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`supabase ${table} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** The stored description in whole sentences, at most `max` characters: a long one loses its last sentences, never half a word or half a fact. */
export function wholeSentences(s: string, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const m = head.match(/^.*[.!?](?=\s)/);
  return m ? m[0] : head.slice(0, max).replace(/\s+\S*$/, "");
}
const DESC_MAX = 700; // stored descriptions run p50 ~300, p90 ~450, max ~810 characters (Kyla + Dan, 2026-10-11)

export function toItem(kind: "photo" | "video", r: any): Item {
  const facts = (r.visual_description ?? "").replace(/\s+/g, " ").trim();
  const ev = evidenceOf(r); // caption is never evidence; stale or contradicted tags and negated clauses are dropped
  const tags = ev.tags;
  return {
    key: `${kind}:${r.id}`,
    kind,
    storagePath: r.storage_path,
    words: ev.trusted ? words(ev.text) : new Set<string>(), // failed/pending/needs_review: no attribute words, so never an exact match
    related: ev.trusted ? relatedWords(ev.text) : new Set<string>(),
    label: firstSentence(r.visual_description || tags.join(", ")),
    desc: `${wholeSentences(facts, DESC_MAX)}${tags.length ? ` (tags: ${tags.join(", ")})` : ""}`,
    explicitness: r.explicitness ?? "none",
    stars: Number(r.star_value) || 0,
    isFree: r.is_free === true, // marked free in her catalogue: the ONLY items she may give away
    analysis: ev.state,
  };
}

/** Every photo and video row of the creator exactly as stored (duplicates included): bundles are matched to files by their exact storage path. */
export type RawCatalogue = { photos: any[]; videos: any[] };
export async function loadRawCatalogue(cloneId: string): Promise<RawCatalogue> {
  const [photos, videos] = await Promise.all([rest("photos", cloneId), rest("videos", cloneId)]);
  return { photos, videos };
}
export function catalogueFromRaw(raw: RawCatalogue): Item[] {
  const p = dedupe(raw.photos), v = dedupe(raw.videos);
  console.log(`[media] ${p.length} photos (${raw.photos.length - p.length} dupes dropped), ${v.length} videos (${raw.videos.length - v.length} dupes dropped)`);
  return [...p.map((r) => toItem("photo", r)), ...v.map((r) => toItem("video", r))];
}
export async function loadCatalogue(cloneId: string): Promise<Item[]> {
  return catalogueFromRaw(await loadRawCatalogue(cloneId));
}

// ---------- tags in her reply ----------
// Stage 1.1: a tag is valid only when the WHOLE bracket matches. A numbered tag names that exact slot (no clamping, no
// swapping kind), numbers are read completely ([photo 10], [photo -1], [photo x] are invalid), free tags are unnumbered,
// and one reply may carry at most one media selection.
const ALIAS = "photo|pic|picture|selfie|video|vid|bundle";
const TAG_FULL = new RegExp(`^\\[\\s*(free\\s+)?(${ALIAS})\\s*#?(\\d+)?\\s*(?::\\s*([^\\]]*))?\\]$`, "i");
export type Want = { kind: "photo" | "video" | "bundle"; hint: string; free: boolean; n?: number; byDesc?: boolean };

// She sometimes copies the history note format ("[locked photo waiting for him to unlock: <desc>]")
// instead of writing a tag. That is still a send: the description picks the menu item.
const NOTE_FULL = /^\[\s*(?:locked\s+(photo|video|bundle)\s+(?:of\s+\d+\s+items\s+)?waiting[^:\]]*|sent\s+him\s+(free)\s+(photo|video))\s*:\s*([^\]]*)\]$/i;
// Brackets that START like a media tag or a delivery note but are not a complete valid one are an invalid selection, not plain text.
const SELECTION_START = new RegExp(`\\[\\s*(?:(?:free\\s+)?(?:${ALIAS})(?![a-z])|locked\\s+(?:photo|video|bundle)\\s+(?:of\\s+\\d+\\s+items\\s+)?waiting|sent\\s+him\\s+free\\s+(?:photo|video))`, "i");
const BRACKET_START = new RegExp(`^${SELECTION_START.source}`, "i");

type Piece = { want: Want } | { bad: string };
function classifyBracket(b: string): Piece | null {
  let m = TAG_FULL.exec(b);
  if (m) {
    const free = !!m[1];
    if (free && m[3] !== undefined) return { bad: "numbered free tag" };
    if (free && /bundle/i.test(m[2])) return { bad: "a bundle is never free" };
    return { want: { kind: /vid/i.test(m[2]) ? "video" : /bundle/i.test(m[2]) ? "bundle" : "photo", hint: (m[4] ?? "").trim(), free, n: m[3] !== undefined ? Number(m[3]) : undefined } };
  }
  m = NOTE_FULL.exec(b);
  if (m) return { want: { kind: /video/i.test(m[1] ?? m[3] ?? "") ? "video" : /bundle/i.test(m[1] ?? "") ? "bundle" : "photo", hint: (m[4] ?? "").trim(), free: !!m[2], byDesc: true } };
  return BRACKET_START.test(b) ? { bad: "malformed media tag" } : null;
}

/**
 * Pull the media selection out of her text. Also drops any other stray [bracket] text so nothing internal reaches the fan.
 * `want` is set only for exactly one valid selection. `invalid` is set for a malformed or repeated selection (the caller
 * then sends a fixed line and no file); ordinary text, even with media words in it, is neither.
 */
export function extractTag(text: string): { clean: string; want: Want | null; invalid?: { reason: string } } {
  const pieces: Piece[] = [];
  const rest = text.replace(/\[[^\[\]]*\]/g, (b) => {
    const p = classifyBracket(b);
    if (!p) return b; // unrelated bracket text: removed below, as before
    pieces.push(p);
    return "";
  });
  if (SELECTION_START.test(rest)) pieces.push({ bad: "unclosed media tag" }); // "[photo 1" with no closing bracket
  const clean = rest
    .replace(/\[[^\]]{0,300}\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!pieces.length) return { clean, want: null };
  const bad = pieces.find((p): p is { bad: string } => "bad" in p);
  if (bad) return { clean, want: null, invalid: { reason: bad.bad } };
  if (pieces.length > 1) return { clean, want: null, invalid: { reason: "more than one media selection" } };
  return { clean, want: (pieces[0] as { want: Want }).want };
}

const ASK_RE = /\b(send|show|see|share|got|have|want|wanna|need|can i get|gimme|give me)\b.{0,40}\b(pics?|photos?|pictures?|selfies?|nudes?|videos?|vids?|clips?)\b|^\s*(pics?|nudes?|photos?|videos?|vids?)\s*[?!.]*\s*$|\b(pics?|photos?|videos?|vids?|selfies?|nudes?)\b\s*(please|pls|plz)\b|\b(show|see)\b.{0,15}\b(you|your|ur)\b.{0,25}\b(body|tits|boobs|ass|butt|pussy|outfit|naked|nude)\b/i;

/** Backup when the fan clearly asks for media and her reply forgot the tag. */
export function fanAsked(text: string): Want | null {
  if (!ASK_RE.test(text)) return null;
  return { kind: /\b(videos?|vids?|clips?)\b/i.test(text) ? "video" : "photo", hint: text, free: false };
}

const SEXY_RE = /\b(fuck|cum|cock|dick|pussy|wet|hard|horny|naked|nude|tits|boobs|ass|suck|lick|ride|strip|panties|bra|lingerie)\b/i;

// Stage 3 weights. A requested attribute that the file really has (EXACT) outranks every nudge below (explicitness up to 1.5, random 0.5),
// a nearby word (NEAR: a towel for "shower") ranks above nothing but never above a real match.
const EXACT = 3, NEAR = 0.75;

/** What he literally asked for that this catalogue can describe (EXACT-able), and what he only asked for through a nearby word.
 *  An attribute the code can describe counts as asked even when no file shows it, so an unavailable request is never invisible. */
export function requestedAttrs(cat: Item[], text: string): { exact: Set<string>; near: Set<string> } {
  const vocab = new Set<string>();
  for (const it of cat) for (const w of it.words) vocab.add(w);
  const exact = new Set([...words(text)].filter((w) => vocab.has(w) || ATTR_CANON.has(w)));
  const near = new Set([...relatedWords(text)].filter((w) => vocab.has(w) && !exact.has(w)));
  return { exact, near };
}
/** The requested attributes this file does not literally show (empty = an exact match). */
export function missingAttrs(it: Item, req: { exact: Set<string>; near: Set<string> }): string[] {
  const miss = [...req.exact].filter((w) => !it.words.has(w));
  if (miss.length) return miss;
  return !req.exact.size && req.near.size ? [...req.near] : []; // only a nearby word was asked: nothing literal meets it
}
/** True when he asked for something this catalogue can describe and this file does not show ALL of it. */
export function isAlternative(it: Item, req: { exact: Set<string>; near: Set<string> }): boolean {
  if (!req.exact.size && !req.near.size) return false; // nothing specific was asked: nothing to be an alternative to
  return missingAttrs(it, req).length > 0;
}

/**
 * Best unsent item for this request: requested attributes the file really shows come first (a nearby word counts for far less),
 * then a nudge toward spicier items when the chat is sexual, random tie-break. Falls back to the other kind
 * if she's out of videos. Returns null only when he has seen everything.
 */
export function pick(cat: Item[], sent: Set<string>, kind: "photo" | "video", hint: string, fanText: string, free = false, focus = ""): Item | null {
  const want = words(`${hint} ${hint} ${fanText}`);
  const wantNear = relatedWords(`${hint} ${fanText}`);
  const focusWords = words(focus); // his newest message: each match counts 3x
  const focusNear = relatedWords(focus);
  const request = requestedAttrs(cat, focus);
  const sexy = SEXY_RE.test(`${hint} ${fanText}`);
  const score = (it: Item) => {
    let s = 0;
    const genericToy = it.words.has("toy");
    for (const w of want) s += it.words.has(w) ? EXACT : it.related.has(w) || (genericToy && SPECIFIC_TOY.has(w)) ? NEAR : 0;
    for (const w of wantNear) if (it.words.has(w) && !want.has(w)) s += NEAR; // he said a nearby word ("towel"), the file shows the attribute ("shower")
    for (const w of focusWords) s += 2 * (it.words.has(w) ? EXACT : it.related.has(w) || (genericToy && SPECIFIC_TOY.has(w)) ? NEAR : 0); // 3x in all, as before
    for (const w of focusNear) if (it.words.has(w) && !focusWords.has(w)) s += 2 * NEAR;
    if (free) s += it.explicitness === "explicit" ? -3 : it.explicitness === "suggestive" ? 0.5 : 0; // free teasers stay tamer
    else if (sexy) s += it.explicitness === "explicit" ? 1.5 : it.explicitness === "suggestive" ? 1 : 0;
    else s += it.explicitness === "explicit" ? -0.5 : 0;
    return s + Math.random() * 0.5;
  };
  for (const k of [kind, kind === "photo" ? "video" : "photo"] as const) {
    const pool = cat.filter((it) => it.kind === k && !sent.has(it.key) && (free || !it.isFree));
    // A full factual match to the newest request outranks historical context. Keep the existing
    // score within each tier, including when there is no specific request or no exact match.
    if (pool.length) return pool.map((it) => ({ it, exact: !isAlternative(it, request), score: score(it) }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)[0].it;
  }
  return null;
}

// ---------- what she can send this turn ----------
/** Stage 3: the ONE bundle that may stand in the menu. `desc` is built by code from the bundle's own verified file descriptions (bundles.ts). */
export type MenuBundle = { id: string; desc: string };
export type Menu = {
  free: Item | null; photos: Item[]; video: Item | null;
  bundle?: MenuBundle | null; // Stage 3: at most one, and it takes the place of the last locked photo
  missing?: Map<string, string[]>; // for each alt key: the requested attributes that file does not show (named to her)
  alt?: Set<string>; // Stage 3: keys of listed locked items that do NOT literally show what he asked for (his newest message named something the catalogue can describe)
};

/**
 * Chosen by code BEFORE her reply, so she knows exactly what each item shows: 3 locked photos matched to the chat,
 * 1 locked video, 1 tame free teaser. All unsent to this fan, no item twice.
 * Stage 3: when a relevant bundle is passed it takes the place of the third photo (the menu stays at most 5 entries), and a listed
 * item that does not literally show what his newest message asked for is marked, so a near miss is never presented as a match.
 */
export function buildMenu(all: Item[], sent: Set<string>, context: string, focus = "", bundle: MenuBundle | null = null): Menu {
  // A row not analysed (pending), whose analysis failed, or that awaits review is never pushed to a fan: its stored description and tags
  // are unverified and must not reach her prompt, and its (max) price must not be sold on them. It returns once it is analysed.
  const cat = all.filter((it) => it.analysis !== "pending" && it.analysis !== "failed" && it.analysis !== "needs_review");
  const taken = new Set(sent);
  const take = (it: Item | null) => { if (it) taken.add(it.key); return it; };
  // Free teaser = only an item marked free in her catalogue. A priced item is never given away.
  const freePool = cat.filter((it) => it.isFree);
  const free = take(pickKind(freePool, taken, "photo", "", true) ?? pickKind(freePool, taken, "video", "", true));
  const photos: Item[] = [];
  for (let i = 0; i < (bundle ? 2 : 3); i++) {
    const it = pickKind(cat, taken, "photo", context, false, focus);
    if (!it) break;
    photos.push(take(it)!);
  }
  const video = take(pickKind(cat, taken, "video", context, false, focus));
  const req = requestedAttrs(cat.filter((it) => !it.isFree), focus);
  // The free teaser is marked like the locked items: it too must not look like an answer to an ask it does not show.
  const listed = [...photos, ...(video ? [video] : []), ...(free ? [free] : [])].filter((it) => isAlternative(it, req));
  const alt = new Set(listed.map((it) => it.key));
  const missing = new Map(listed.map((it) => [it.key, missingAttrs(it, req)] as const));
  return { free, photos, video, ...(bundle ? { bundle } : {}), ...(alt.size ? { alt, missing } : {}) };
}

function pickKind(cat: Item[], taken: Set<string>, kind: "photo" | "video", context: string, free: boolean, focus = ""): Item | null {
  const it = pick(cat, taken, kind, "", context, free, focus);
  return it && it.kind === kind ? it : null;
}

/** Full description for her: the stored visual description, trimmed. */
export const describe = (it: Item) => it.desc;
export const ALT_NOTE = "closest available, not an exact match for what he asked";

export function menuText(m: Menu): string {
  const lines: string[] = [];
  const alt = (it: Item) => {
    if (!m.alt?.has(it.key)) return "";
    const miss = m.missing?.get(it.key) ?? [];
    return `${ALT_NOTE}${miss.length ? ` (does not show: ${miss.join(", ")})` : ""}: `;
  };
  m.photos.forEach((it, i) => lines.push(`[photo ${i + 1}] (locked): ${alt(it)}${describe(it)}`));
  if (m.video) lines.push(`[video 1] (locked): ${alt(m.video)}${describe(m.video)}`);
  if (m.bundle) lines.push(`[bundle 1] (locked): ${m.bundle.desc}`);
  if (m.free) lines.push(`[free ${m.free.kind}] (free): ${alt(m.free)}${describe(m.free)}`);
  if (!lines.length) return "YOUR CONTENT READY TO SEND\n(none left for him right now, so don't offer any)";
  const altHint = m.alt?.size ? ` (A line marked "${ALT_NOTE.split(",")[0]}" is not what he asked for: if you offer it, say so in your own words and never write the marker words or "does not show" to him.)` : "";
  return `YOUR CONTENT READY TO SEND (descriptions of you, written by someone looking at the file)${altHint}\n${lines.join("\n")}`;
}

/** Fixed fan-facing lines for an invalid media selection (Stage 1.1). No file goes out with either of them. */
export const UNAVAILABLE_FREE_TEXT = "i don\u2019t have a free preview available right now";
export const UNAVAILABLE_TEXT = "i can\u2019t send that one right now";

/**
 * Resolve her tag against this turn's menu. EXACT: a numbered tag is that slot or nothing (never clamped to another slot),
 * an unnumbered tag is the first slot of its kind, a free tag is the displayed free item and only if it has that kind.
 * A copied delivery note picks the best matching listed item (it goes out the way its slot says, free or locked).
 */
export function fromMenu(m: Menu, want: Want): { item: Item; free: boolean } | null {
  if (want.kind === "bundle") return null; // a bundle is resolved by bundleFromMenu (bundles.ts): it is not a single item
  if (want.byDesc) {
    // Pick the menu item her description matches best; nothing if it matches none of them.
    // Search every slot: the item she described decides, and it goes out the way its slot says (free or locked).
    const slots = [...m.photos.map((it) => ({ it, free: false })), ...(m.video ? [{ it: m.video, free: false }] : []), ...(m.free ? [{ it: m.free, free: true }] : [])];
    const w = words(want.hint);
    const best = slots.filter((x) => x.it.kind === want.kind).map((x) => [[...w].filter((y) => x.it.words.has(y)).length, x] as const).sort((a, b) => b[0] - a[0])[0];
    return best && best[0] >= 2 ? { item: best[1].it, free: best[1].free } : null;
  }
  if (want.free) return m.free && m.free.kind === want.kind ? { item: m.free, free: true } : null;
  const n = want.n ?? 1;
  if (!Number.isInteger(n) || n < 1) return null;
  if (want.kind === "video") return n === 1 && m.video ? { item: m.video, free: false } : null;
  return m.photos[n - 1] ? { item: m.photos[n - 1], free: false } : null;
}

/** Download the real full file from private storage via a short-lived signed URL. */
export async function download(it: Item): Promise<Buffer> {
  const sign = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/media/${it.storagePath}`, {
    method: "POST",
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 300 }),
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await sign.json().catch(() => ({}));
  if (!sign.ok || !j.signedURL) throw new Error(`sign failed ${sign.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const res = await fetch(`${config.supabaseUrl}/storage/v1${j.signedURL}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
