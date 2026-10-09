import type { Account, Creator, Fan, Memory, Message, Platform, Purchase } from "./types";
import { briannaFans } from "./brianna-data";
import { withBriannaLedger } from "./brianna-ledger";

// Isolated presentation fixtures. Only imported by the guarded server page.
// Mark/Kyla's three Telegram purchases and four non-sensitive memory fields
// are based on the owner's verified example. Other channels, identities,
// conversations and fans illustrate the planned experience. No live IDs,
// private transcript excerpts, database writes or platform credentials belong here.
export const creators: Creator[] = [
  { id: "kyla", name: "Kyla Yesenosky", initials: "KY", color: "#637bea" },
  { id: "riley", name: "Riley Mae Lewis", initials: "RL", color: "#ad69a8" },
  { id: "briana", name: "Brianna Redd", initials: "BR", color: "#cf8c48" },
];
const linkedAt = "2026-10-01T04:00:00Z";
function accounts(name: string, channels: Platform[]): Account[] {
  return channels.map(platform => ({ platform, username: `${name.toLowerCase()}_${platform === "telegram" ? "tg" : platform === "onlyfans" ? "of" : platform === "fanvue" ? "fv" : "fs"}`, linkedAt }));
}
function memory(id: string, label: string, value: string, category = "Personal details", source: Platform = "telegram"): Memory {
  return { id, label, value, category, source, updatedAt: "2026-09-20T20:29:39Z" };
}
const markMessages: Message[] = [
  { id: "mark-tg-1", platform: "telegram", direction: "in", text: "I have been thinking about another trip to Europe.", at: "2026-10-08T21:04:00Z" },
  { id: "mark-tg-2", platform: "telegram", direction: "out", text: "You mentioned enjoying Europe before. Is there somewhere new you would like to visit?", at: "2026-10-08T21:05:00Z" },
  { id: "mark-tg-3", platform: "telegram", direction: "in", text: "Portugal is at the top of my list. I will send you a few ideas later.", at: "2026-10-08T21:07:00Z" },
  { id: "mark-of-1", platform: "onlyfans", direction: "in", text: "Hey Kyla, it is Mark from Telegram. Good to see you here too.", at: "2026-10-09T06:10:00Z" },
  { id: "mark-of-2", platform: "onlyfans", direction: "out", text: "Hey Mark! Have you narrowed down those Portugal plans yet?", at: "2026-10-09T06:11:00Z" },
  { id: "mark-of-3", platform: "onlyfans", direction: "in", text: "Still choosing between Lisbon and Porto. Also, I loved the latest collection.", at: "2026-10-09T06:13:00Z" },
  { id: "mark-fv-1", platform: "fanvue", direction: "in", text: "Found your Fanvue account as well. This is the same Mark.", at: "2026-10-08T08:20:00Z" },
  { id: "mark-fv-2", platform: "fanvue", direction: "out", text: "Welcome over here, Mark. Your new collection is in the library.", at: "2026-10-08T08:21:00Z" },
  { id: "mark-fs-1", platform: "fansly", direction: "in", text: "The weekend video was great. Thanks for sharing it.", at: "2026-10-07T05:15:00Z" },
  { id: "mark-fs-2", platform: "fansly", direction: "out", text: "Glad you enjoyed it! How is your week going?", at: "2026-10-07T05:17:00Z" },
];
const markPurchases: Purchase[] = [
  { id: "mark-tg-photo", platform: "telegram", title: "Private photo", kind: "Photo", amount: 6950, currency: "Stars", at: "2026-09-19T22:36:53Z" },
  { id: "mark-tg-video-1", platform: "telegram", title: "Video collection 01", kind: "Video", amount: 4650, currency: "Stars", at: "2026-09-19T22:56:51Z" },
  { id: "mark-tg-video-2", platform: "telegram", title: "Video collection 02", kind: "Video", amount: 4650, currency: "Stars", at: "2026-09-19T23:23:07Z" },
  { id: "mark-of-collection", platform: "onlyfans", title: "October collection", kind: "Bundle", amount: 125, currency: "USD", at: "2026-10-08T06:00:00Z" },
  { id: "mark-of-video", platform: "onlyfans", title: "Behind the scenes", kind: "Video", amount: 85, currency: "USD", at: "2026-10-05T07:00:00Z" },
  { id: "mark-of-photo", platform: "onlyfans", title: "September collection", kind: "Bundle", amount: 75, currency: "USD", at: "2026-10-02T07:00:00Z" },
  { id: "mark-fv-collection", platform: "fanvue", title: "New collection", kind: "Bundle", amount: 54, currency: "USD", at: "2026-10-08T08:10:00Z" },
  { id: "mark-fs-weekend", platform: "fansly", title: "Weekend video", kind: "Video", amount: 72, currency: "USD", at: "2026-10-07T05:00:00Z" },
];
function otherFan(id: string, creatorId: string, name: string, channels: Platform[], topic: string, value: string, unread = 0): Fan {
  const platform = channels[0];
  return { id, creatorId, name, initials: name.slice(0, 1), color: "#6086a4", firstSeen: "2026-09-25T06:00:00Z", unread,
    summary: `${name} follows this creator on ${channels.length} ${channels.length === 1 ? "platform" : "platforms"}. ${value}.`,
    accounts: accounts(`${name}_${creatorId}`, channels),
    messages: channels.flatMap((channel, index) => [
      { id: `${id}-${channel}-in`, platform: channel, direction: "in" as const, text: index ? "Good to catch up with you here as well." : "Hi! How has your week been?", at: `2026-10-09T0${5 - index}:10:00Z` },
      { id: `${id}-${channel}-out`, platform: channel, direction: "out" as const, text: `Hey ${name}! It has been a good week. How about yours?`, at: `2026-10-09T0${5 - index}:12:00Z` },
    ]),
    purchases: [{ id: `${id}-purchase`, platform, title: "Creator collection", kind: "Bundle", amount: platform === "telegram" ? 1250 : 35, currency: platform === "telegram" ? "Stars" : "USD", at: "2026-10-07T09:00:00Z" }],
    memories: [memory(`${id}-interest`, topic, value, "Interests", platform), memory(`${id}-language`, "Language", "English", "Personal details", platform)],
  };
}
export const authoredFans: Fan[] = [
  { id: "kyla-mark", creatorId: "kyla", name: "Mark", initials: "M", color: "#4d78db", firstSeen: "2026-09-19T22:19:02Z", unread: 2,
    summary: "Mark follows Kyla across four linked accounts. He enjoys travel and late-night conversations. His relationship context stays together while each platform keeps its own conversation and purchases.",
    accounts: accounts("mark", ["onlyfans", "telegram", "fanvue", "fansly"]), messages: markMessages, purchases: markPurchases,
    memories: [memory("location", "Location", "Arizona"), memory("language", "Language", "English"), memory("travel", "Travel", "Europe and South America", "Interests"), memory("availability", "Availability", "Late nights", "Conversation preferences")],
  },
  otherFan("kyla-alex", "kyla", "Alex", ["onlyfans", "telegram"], "Interests", "Enjoys live music and photography", 1),
  otherFan("kyla-james", "kyla", "James", ["telegram"], "Interests", "Enjoys hiking and weekend trips"),
  otherFan("kyla-daniel", "kyla", "Daniel", ["onlyfans", "fanvue", "fansly"], "Interests", "Follows new collections and creator updates", 1),
  otherFan("riley-chris", "riley", "Chris", ["onlyfans", "fansly"], "Interests", "Enjoys fitness and photography", 1),
  otherFan("riley-mark", "riley", "Mark", ["telegram"], "Interests", "Enjoys cooking and live music"),
  ...briannaFans,
];
export const fans = withBriannaLedger(authoredFans);
