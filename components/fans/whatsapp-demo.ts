import type { Fan, Message } from './types';

/** Local demo histories only. No phone numbers, credentials or platform writes. */
export function withWhatsAppDemo(fans: Fan[]): Fan[] {
  return fans.map(fan => {
    const index = Number(fan.id.replace('briana-ledger-', '')) - 1;
    const selected = fan.id === 'briana-ben' || fan.id.startsWith('briana-ledger-') && index % 7 === 1 && index % 8 !== 0;
    if (fan.creatorId !== 'briana' || !selected || fan.accounts.some(a => a.platform === 'whatsapp')) return fan;
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
