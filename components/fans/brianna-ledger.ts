import type { Fan, Memory, Message, Platform, Purchase } from "./types";

// Owner-requested presentation records, kept separate from production revenue.
// The same deterministic records drive Dashboard, profiles, ownership and chats.
// Never persist this generated ledger to a platform or a live data service.
export const briannaPeriods = [
  { from: "2026-04-10", to: "2026-05-09", revenueCents: 4_028_752, buyers: 308, orders: 778 },
  { from: "2026-05-10", to: "2026-06-09", revenueCents: 5_210_938, buyers: 342, orders: 991 },
  { from: "2026-06-10", to: "2026-07-09", revenueCents: 3_837_516, buyers: 328, orders: 789 },
  { from: "2026-07-10", to: "2026-08-09", revenueCents: 5_512_683, buyers: 389, orders: 1084 },
  { from: "2026-08-10", to: "2026-09-09", revenueCents: 4_291_867, buyers: 365, orders: 872 },
  { from: "2026-09-10", to: "2026-10-09", revenueCents: 4_618_600, buyers: 384, orders: 912 },
] as const;

const firstNames = ["Adam", "Adrian", "Aaron", "Andrew", "Anthony", "Austin", "Blake", "Brandon", "Caleb", "Cameron", "Carter", "Charles", "Connor", "Dylan", "Edward", "Elliot", "Ethan", "Felix", "Finn", "Gabriel", "George", "Harry", "Henry", "Hugo", "Isaac", "Jack", "Jacob", "James", "Jason", "Jasper", "Joel", "Jonah", "Jordan", "Joseph", "Julian", "Kai", "Liam", "Logan", "Louis", "Luke", "Mason", "Matthew", "Max", "Michael", "Miles", "Nathan", "Nicholas", "Noah", "Oscar", "Owen", "Patrick", "Peter", "Reece", "Ryan", "Samuel", "Scott", "Sean", "Sebastian", "Simon", "Theo", "Thomas", "Toby", "Tyler", "William"];
const surnames = ["Parker", "Hayes", "Bennett", "Morgan", "Ellis", "Reed", "Brooks", "Walker"];
const platforms: Platform[] = ["onlyfans", "telegram"];
const platformLabels = { onlyfans: "OnlyFans", telegram: "Telegram" };
const colors = ["#4d78db", "#718ba6", "#8b719e", "#5c9183", "#aa825c", "#697dae", "#987780", "#568eaa"];
const personas = [
  { city: "Melbourne", job: "architect", hobby: "weekend hiking", music: "acoustic playlists", coffee: "a flat white", project: "a coastal walking weekend", progress: "the walking route", routine: "after dinner", collection: "natural outdoor photos" },
  { city: "London", job: "software developer", hobby: "film photography", music: "indie records", coffee: "filter coffee", project: "a small photo book", progress: "the photo sequence", routine: "after the evening commute", collection: "window-light portraits" },
  { city: "Toronto", job: "restaurant manager", hobby: "trying new recipes", music: "soul records", coffee: "an espresso", project: "a dinner for friends", progress: "the menu", routine: "on mornings before a shift", collection: "short behind-the-scenes videos" },
  { city: "Perth", job: "electrician", hobby: "surfing", music: "alternative rock", coffee: "a long black", project: "a long weekend by the coast", progress: "the weekend plans", routine: "after work", collection: "relaxed outdoor collections" },
  { city: "Manchester", job: "teacher", hobby: "live music", music: "jazz and blues", coffee: "a cappuccino", project: "a concert evening with friends", progress: "the concert booking", routine: "after marking in the evening", collection: "small photo-led bundles" },
  { city: "Seattle", job: "product designer", hobby: "trail running", music: "ambient playlists", coffee: "a pour-over", project: "a local trail event", progress: "the training plan", routine: "after the morning run", collection: "natural-light videos" },
  { city: "Auckland", job: "project manager", hobby: "camping", music: "classic soul", coffee: "a flat white", project: "a camping trip with friends", progress: "the campsite booking", routine: "after dinner on weekdays", collection: "coastal photo collections" },
  { city: "Sydney", job: "graphic designer", hobby: "street photography", music: "electronic music", coffee: "an iced latte", project: "a set of prints for the studio", progress: "the print selection", routine: "between afternoon projects", collection: "studio diaries and lighting notes" },
];
const releases = ["April", "May", "June", "July", "August", "September"];
const collectionNames = ["Window light", "Coastal diary", "Studio afternoon", "Golden hour", "Weekend notes", "Afterglow", "Soft focus", "Morning journal", "Rooftop light", "Sunday portraits", "Evening diary", "Behind the scenes", "Quiet moments", "Daylight edits", "Coastline", "Studio notes"];
const DAY = 86400000;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dayAt = (at: string) => new Date(Date.parse(at) + 10 * 3600000).toISOString().slice(0, 10);
const at = (day: string, minute = 0) => `${day}T07:${String(minute % 60).padStart(2, "0")}:00Z`;
const hash = (value: string) => { let n = 2166136261; for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; };
const purchaseCents = (p: Purchase) => p.currency === "Stars" ? Math.round(p.amount * 1.3) : Math.round(p.amount * 100);

function makeFan(index: number): Fan {
  const phase = index < 368 ? 0 : index < 400 ? 1 : index < 432 ? 2 : index < 464 ? 3 : index < 488 ? 4 : 5;
  const firstDay = shift(briannaPeriods[phase].from, index % 8);
  const name = `${firstNames[index % firstNames.length]} ${surnames[Math.floor(index / firstNames.length)]}`;
  const id = `briana-ledger-${index + 1}`;
  const primary = platforms[index % 20 < 15 ? 0 : 1];
  const channels = index % 12 === 0 || index % 5 < 2
    ? [primary, ...platforms.filter(p => p !== primary)] : [primary];
  const persona = personas[index % personas.length];
  const username = name.toLowerCase().replace(" ", "_");
  const accounts = channels.map((platform, i) => ({ platform, username: `${username}_${platform === "telegram" ? "tg" : "of"}`, linkedAt: at(shift(firstDay, i), 2) }));
  const messages: Message[] = [];
  const add = (key: string, platform: Platform, day: string, text: string, reply: string, minute = 2) => {
    const incoming: Message = { id: `${id}-${key}-in`, platform, direction: "in", at: at(day, minute), text };
    messages.push(incoming, { id: `${id}-${key}-out`, platform, direction: "out", at: at(day, minute + 1), text: reply });
    return incoming;
  };
  const intro = add("intro", primary, firstDay,
    `Hi Brianna, I'm ${name}. I live in ${persona.city} and work as a ${persona.job}. English is my first language. ${firstNames[index % 64]} is fine for my name here. Found your ${persona.collection} and wanted to say hello.`,
    `Hi ${firstNames[index % 64]}! Lovely to meet you. How is the week in ${persona.city} going?`);
  const interests = add("interests", primary, firstDay,
    `Outside work I like ${persona.hobby}. Usually have ${persona.coffee} with ${persona.music} on. My current plan is ${persona.project}; I'm still working on ${persona.progress}.`,
    `That sounds like a good project to have outside work. Let me know how ${persona.progress} comes together.`, 6);
  const preferences = add("preferences", primary, firstDay,
    `I check ${platformLabels[primary]} ${persona.routine}. Short messages and one question at a time suit me. If work gets busy, I'll reply when I can; please don't send daily reminders.`,
    `Of course. I'll keep it simple and leave you room when work is busy. We can pick the conversation up when you're free.`, 10);
  const content = add("content", primary, firstDay,
    `I tend to choose ${persona.collection}. I like a clear description of a collection before buying, and one relevant suggestion is plenty. Please check what I own before recommending the same material on another app.`,
    `I'll keep the contents clear and check your owned collections first. Thank you for letting me know what you enjoy.`, 14);
  const memories: Memory[] = [];
  const remember = (category: string, label: string, value: string, source: Message) => memories.push({ id: `${id}-memory-${memories.length}`, category, label, value, source: source.platform, updatedAt: source.at, sourceMessageId: source.id });
  remember("Personal details", "Home", `Lives in ${persona.city}.`, intro);
  remember("Personal details", "Occupation", `Works as a ${persona.job}; busy periods explain slower replies.`, intro);
  remember("Personal details", "Preferred name", `Uses ${firstNames[index % 64]} in conversation.`, intro);
  remember("Personal details", "Language", "English is his first language.", intro);
  remember("Interests & routines", "Outside work", `Enjoys ${persona.hobby}.`, interests);
  remember("Interests & routines", "Music", `Listens to ${persona.music}.`, interests);
  remember("Interests & routines", "Coffee", `Usually chooses ${persona.coffee}.`, interests);
  remember("Interests & routines", "Current project", `Working on ${persona.project}, starting with ${persona.progress}.`, interests);
  remember("Conversation preferences", "Usual availability", `Checks messages ${persona.routine}.`, preferences);
  remember("Conversation preferences", "Message length", "Prefers short messages rather than long paragraphs.", preferences);
  remember("Conversation preferences", "Questions", "One question at a time suits his routine.", preferences);
  remember("Conversation preferences", "Room during work", "Will reply when free; explicitly asked to avoid daily reminders.", preferences);
  remember("Shared history", "First connection", `First connected through an interest in ${persona.collection}.`, intro);
  remember("Shared history", "Project introduced", `Shared plans for ${persona.project} in the first conversation.`, interests);
  remember("Content preferences", "Collection style", `Prefers ${persona.collection}.`, content);
  remember("Content preferences", "Contents before buying", "Wants an exact description of what a collection includes.", content);
  remember("Content preferences", "Relevant recommendations", "Prefers one suitable suggestion rather than a long offer list.", content);
  remember("Content preferences", "Ownership across channels", "Check existing ownership before suggesting the same material on another app.", content);
  const history = [{ id: `${id}-history-intro`, title: "First conversation", summary: `Introduced his home, work and interest in ${persona.collection}.`, platform: primary, at: intro.at, sourceMessageId: intro.id }];
  for (const account of accounts.slice(1)) {
    const link = add(`linked-${account.platform}`, account.platform, dayAt(account.linkedAt),
      `It's ${name}, ${accounts[0].username} on ${platformLabels[primary]}. This is my ${platformLabels[account.platform]} account, ${account.username}. Same person; happy to keep ${persona.project} in one conversation history.`,
      `Good to see you here too, ${firstNames[index % 64]}. We can keep the same project thread going on ${platformLabels[account.platform]}.`);
    history.push({ id: `${id}-history-link-${account.platform}`, title: `${platformLabels[account.platform]} account linked`, summary: "Confirmed both usernames and continued the same creator relationship.", platform: account.platform, at: link.at, sourceMessageId: link.id });
  }
  let latest = interests;
  for (let month = phase; month < briannaPeriods.length; month++) {
    // Some fans have been quiet this month; activity is derived from messages.
    if (month === 5 && index % 8 === 0) continue;
    const period = briannaPeriods[month];
    const day = shift(period.from, Math.max(month === phase ? index % 8 + 5 : 5, 10 + index % 13));
    const account = accounts[(month - phase) % accounts.length];
    const stages = ["choosing the details", "booking the date", "getting everything ready", "trying the first version", "making the final changes", "looking forward to the finished result"];
    latest = add(`progress-${month}`, account.platform, day,
      `An update on ${persona.project}: I'm ${stages[month]} now. ${persona.progress} has moved along since our last chat. Still making time for ${persona.hobby} when work allows.`,
      `Thanks for the update, ${firstNames[index % 64]}. Nice to hear ${persona.progress} has moved on. How did that part go?`, 18);
    const follow = add(`follow-${month}`, account.platform, day,
      `It went well. I like that you remembered ${persona.project} from our earlier chat. Let's pick it up next time after I've made the next step; no need to chase before then.`,
      `Absolutely. Enjoy working on the next step, and tell me how it goes when you have a quiet moment.`, 22);
    history.push({ id: `${id}-history-progress-${month}`, title: `${releases[month]} project update`, summary: `Reported progress on ${persona.progress} and asked to resume the topic at the next conversation.`, platform: account.platform, at: follow.at, sourceMessageId: follow.id });
    latest = follow;
  }
  remember("Shared history", "Latest project update", `Most recently reported progress on ${persona.progress}.`, latest);
  remember("Open follow-ups", "Next natural topic", `At the next conversation ask how the next step of ${persona.project} went.`, latest);
  remember("Open follow-ups", "Timing", "He asked to resume when he next messages; avoid chasing before that.", latest);
  return { id, creatorId: "briana", name, initials: name.split(" ").map(n => n[0]).join(""), color: colors[index % colors.length], firstSeen: intro.at, unread: index % 19 === 0 ? 1 : 0,
    summary: `${name} is a ${persona.city} ${persona.job} who connected with Brianna through ${persona.collection}. He enjoys ${persona.hobby}, ${persona.music} and ${persona.coffee}. Their ongoing thread follows ${persona.project}. He prefers short, occasional messages and clear collection contents; ownership stays together across his ${accounts.length === 1 ? "single account" : `${accounts.length} linked accounts`}.`,
    accounts, messages, memories, history, purchases: [],
    notes: [{ id: `${id}-note-preferences`, at: preferences.at, text: `Keep messages short, ask one question and leave room around work. Usual availability: ${persona.routine}.` }, { id: `${id}-note-content`, at: content.at, text: `Prefers ${persona.collection}. Check ownership across linked accounts before making a recommendation.` }, { id: `${id}-note-context`, at: latest.at, text: `Next topic: the next step of ${persona.project}. Pick it up when he returns rather than sending reminders.` }],
    suggestedReplies: Object.fromEntries(accounts.map(a => [a.platform, `Hi ${firstNames[index % 64]}, good to hear from you. How did the next step of ${persona.project} go?`])),
  };
}

export function buildBriannaLedger(curated: Fan[]): Fan[] {
  const fans = Array.from({ length: 512 }, (_, i) => makeFan(i));
  for (let month = 0; month < briannaPeriods.length; month++) {
    const period = briannaPeriods[month];
    const eligible = fans.filter(f => dayAt(f.firstSeen) <= period.to).sort((a, b) => hash(`${month}:${a.id}`) - hash(`${month}:${b.id}`)).slice(0, period.buyers);
    const repeatCount = Math.round(eligible.length * .65);
    const orders: { fan: Fan; purchase: Purchase; weight: number }[] = [];
    for (let order = 0; order < period.orders; order++) {
      const fan = eligible[order < eligible.length ? order : (order - eligible.length) % repeatCount];
      const sequence = orders.filter(p => p.fan.id === fan.id).length;
      const account = fan.accounts[(sequence + month) % fan.accounts.length];
      const earliest = [period.from, dayAt(account.linkedAt)].sort().at(-1)!;
      const days = Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)) / DAY) + 1;
      const day = shift(earliest, hash(`${fan.id}:${month}:${sequence}:day`) % days);
      const kind: Purchase["kind"] = sequence % 3 === 0 ? "Photo" : sequence % 3 === 1 ? "Video" : "Bundle";
      const title = `${releases[month]} ${collectionNames[(sequence + month * 3) % collectionNames.length]}`;
      const weight = (kind === "Photo" ? 27 : kind === "Video" ? 49 : 79) + hash(`${fan.id}:${month}:${sequence}:price`) % 21;
      const amount = account.platform === "telegram" ? Math.round(weight / .013 / 50) * 50 : weight;
      orders.push({ fan, weight, purchase: { id: `${fan.id}-purchase-${month}-${sequence}`, platform: account.platform, title, kind, amount, currency: account.platform === "telegram" ? "Stars" : "USD", at: at(day, 30 + hash(`${fan.id}:${order}:time`) % 20) } });
    }
    const existing = curated.flatMap(f => f.purchases).filter(p => dayAt(p.at) >= period.from && dayAt(p.at) <= period.to).reduce((sum, p) => sum + purchaseCents(p), 0);
    const stars = orders.filter(p => p.purchase.currency === "Stars").reduce((sum, p) => sum + purchaseCents(p.purchase), 0);
    const usd = orders.filter(p => p.purchase.currency === "USD");
    const available = period.revenueCents - existing - stars;
    const totalWeight = usd.reduce((sum, p) => sum + p.weight, 0);
    let allocated = 0;
    for (const item of usd) { const cents = Math.floor(available * item.weight / totalWeight); item.purchase.amount = cents / 100; allocated += cents; }
    // Integer-cent remainder allocation keeps the requested total exact.
    for (let i = 0; i < available - allocated; i++) usd[i % usd.length].purchase.amount = (Math.round(usd[i % usd.length].purchase.amount * 100) + 1) / 100;
    for (const { fan, purchase } of orders) {
      const sourceId = `${purchase.id}-source`;
      purchase.sourceMessageId = sourceId;
      const amount = purchase.currency === "Stars" ? `${purchase.amount.toLocaleString("en-US")} Stars` : `$${purchase.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      fan.messages.push({ id: sourceId, platform: purchase.platform, direction: "in", at: purchase.at,
        text: `Unlocked ${purchase.title} for ${amount}. Read the contents first and checked it against my library; this is a new ${purchase.kind.toLowerCase()} for me.` },
      { id: `${purchase.id}-reply`, platform: purchase.platform, direction: "out", at: new Date(Date.parse(purchase.at) + 60000).toISOString(),
        text: `Thank you, ${fan.name.split(" ")[0]}. ${purchase.title} is in your owned library now. Hope you enjoy this ${purchase.kind.toLowerCase()} when you have a quiet moment.` });
      fan.purchases.push(purchase);
    }
    if (orders.reduce((sum, p) => sum + purchaseCents(p.purchase), existing) !== period.revenueCents) throw new Error(`Brianna ${period.from}: ledger does not reconcile`);
  }
  for (const fan of fans) { fan.messages.sort((a, b) => a.at.localeCompare(b.at)); fan.purchases.sort((a, b) => a.at.localeCompare(b.at)); }
  return fans;
}

const expanded = new WeakMap<Fan[], Fan[]>();
// Send only authored seed records through the server/client boundary. Rebuild
// the deterministic ledger locally, avoiding a multi-megabyte serialized prop.
export function withBriannaLedger(seed: Fan[]): Fan[] {
  if (seed.some(f => f.id.startsWith("briana-ledger-"))) return seed;
  const cached = expanded.get(seed);
  if (cached) return cached;
  const result = [...seed, ...buildBriannaLedger(seed.filter(f => f.creatorId === "briana"))];
  expanded.set(seed, result);
  return result;
}
