import type { Fan, Message } from './types';

const selectedForWhatsApp = (fan: Fan) => {
  const index = Number(fan.id.replace('briana-ledger-', '')) - 1;
  return fan.creatorId === 'briana' && (fan.id === 'briana-ben' || fan.id.startsWith('briana-ledger-') && index % 7 === 1 && index % 8 !== 0);
};
const catchUps = [
  ["Got a little break between jobs. How's your afternoon going?", "A quiet afternoon here. Hope the rest of your workday goes smoothly."],
  ["Just picked up a coffee before heading back. Needed that today.", "A coffee break can help. Did you get a chance to sit down for a minute?"],
  ["Managed a short walk after work. Nice to get away from the screen.", "That sounds like a good reset after a long day."],
  ["Keeping dinner simple tonight, then having an early night.", "Sounds sensible. Hope you get a restful evening."],
  ["I've got some music on while I finish a few things at home.", "A little music makes those jobs more pleasant. What are you listening to?"],
  ["Caught up with a friend today. We hadn't spoken properly in a while.", "Glad you found time for a catch-up. Those are always nice."],
  ["A few plans moved around, but the weekend is looking good.", "Good to hear. Hope you get some time to enjoy it."],
  ["Thanks for the quick chat. I'll check in when work settles down.", "Any time. Take care and we'll catch up when you're free."],
] as const;

/** Local demo histories only. No phone numbers, credentials or platform writes. */
export function withWhatsAppDemo(fans: Fan[]): Fan[] {
  // Preserve Ben's eight authored messages. Allocate the owner's requested
  // 5,495-message demo total across the generated histories, so date filters,
  // sparklines and inbox drill-downs count the same sent and received records.
  const generated = fans.filter(fan => selectedForWhatsApp(fan) && fan.id !== 'briana-ben');
  const remaining = 5_495 - 8;
  const messageTargets = new Map(generated.map((fan, index) => [fan.id, Math.floor(remaining / generated.length) + (index < remaining % generated.length ? 1 : 0)]));
  return fans.map(fan => {
    if (!selectedForWhatsApp(fan) || fan.accounts.some(a => a.platform === 'whatsapp')) return fan;
    const ben = fan.id === 'briana-ben';
    const name = fan.name.split(' ')[0];
    const pairs = ben ? [
      ['2026-09-24T07:10:00Z', "Hey Brianna, it's Ben, ben_coast from OnlyFans and Telegram. Happy to link this WhatsApp too. I use it for quick catch-ups between edits.", "Hi Ben! We can pick up the same conversation here. Did you decide on A3 for your Tea Tree Bay print?"],
      ['2026-09-24T07:16:00Z', "Yes, A3 for the desk wall. Ordered it today. Please keep WhatsApp for normal catch-ups, no collection offers here.", "Of course. Just catch-ups here, and I'll remember the print is on its way."],
      ['2026-10-06T07:25:00Z', "The print arrived! Going above the desk once this restaurant launch edit is done. Still delivering on October 10.", "That's a nice thing waiting at the end of the deadline. How did the final sound pass go?"],
      ['2026-10-09T07:40:00Z', "Final export is running. Client review tomorrow, then the acoustic gig on the 17th. A short good-luck message is all I need today haha.", "Good luck with the review tomorrow, Ben! Hope you get a quiet evening once that export finishes. How does the print look above the desk?"],
    ] : [
      ['2026-09-25T07:12:00Z', `Hi Brianna, it's ${name} from our other chat. Happy to link my WhatsApp for occasional everyday catch-ups.`, `Hi ${name}! Good to see you here too. We can keep the same conversation going.`],
      ['2026-10-09T07:32:00Z', "Busy week, but I've finally made some time for my weekend plans. Keeping messages short while I'm at work.", `Sounds good, ${name}. I'll keep it short. How are the weekend plans coming together?`],
    ];
    const messages: Message[] = pairs.flatMap(([at, text, reply], i) => [
      { id: `${fan.id}-wa-${i}-in`, platform: 'whatsapp', direction: 'in', at, text },
      { id: `${fan.id}-wa-${i}-out`, platform: 'whatsapp', direction: 'out', at: new Date(Date.parse(at) + 60_000).toISOString(), text: reply },
    ]);
    const linkedAt = messages[0].at;
    const source = messages[2];
    const extra = Math.max(0, (messageTargets.get(fan.id) ?? messages.length) - messages.length);
    for (let i = 0; i < extra; i++) {
      const pair = Math.floor(i / 2);
      const day = Math.floor(pair * 13 / Math.ceil(extra / 2));
      const at = new Date(Date.parse('2026-09-26T07:10:00Z') + day * 86_400_000 + (pair % 4 * 5 + i % 2) * 60_000).toISOString();
      messages.push({ id: `${fan.id}-wa-catch-up-${i}`, platform: 'whatsapp', direction: i % 2 === 0 ? 'in' : 'out', at, text: catchUps[pair % catchUps.length][i % 2] });
    }
    return { ...fan,
      summary: ben ? fan.summary.replace('OnlyFans and Telegram', 'OnlyFans, Telegram and WhatsApp').replace('with Telegram his preferred place for quick chats', 'with Telegram and WhatsApp used for quick catch-ups') : fan.summary,
      accounts: [...fan.accounts, { platform: 'whatsapp', username: name, linkedAt }],
      messages: [...fan.messages, ...messages].sort((a, b) => a.at.localeCompare(b.at)),
      memories: [...fan.memories, { id: `${fan.id}-wa-preference`, category: 'Conversation preferences', label: 'WhatsApp preferences', value: ben ? 'Everyday catch-ups only. No collection offers. Short messages around his edit deadlines.' : 'Occasional everyday catch-ups. Keep messages short during work.', source: 'whatsapp', updatedAt: source.at, sourceMessageId: source.id }],
      history: [...(fan.history || []), { id: `${fan.id}-wa-linked`, title: 'WhatsApp account linked', summary: 'Confirmed the same fan and continued the shared conversation on WhatsApp.', platform: 'whatsapp', at: linkedAt, sourceMessageId: messages[0].id }],
      suggestedReplies: { ...fan.suggestedReplies, whatsapp: ben ? "Good luck with tomorrow's client review, Ben. How does the Tea Tree Bay print look above your desk?" : `Hi ${name}, how are the weekend plans coming together?` },
    };
  });
}
