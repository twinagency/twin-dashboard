import { channelKey, emptyState, messagesFor, platformNames } from '../fans/model';
import type { Fan, Message, Platform, WorkspaceState } from '../fans/types';
import { effectiveMode, emptyInbox, type InboxState } from '../inbox/model';
import { ownership, type LibraryItem, type Sale } from '../content-library/model';
import { dayAt, valueCents, type DisplayCurrency } from '../dashboard/model';

// Presentation-only campaign records. This module has no delivery, database,
// payment or platform clients. Completed purchases are read, never manufactured.
export const CAMPAIGN_STORAGE = 'twin-campaigns-v1';
export const statuses = ['Draft', 'Scheduled', 'Active', 'Paused', 'Completed'] as const;
export type Status = typeof statuses[number];
export const goals = ['New content', 'Paid offer', 'Reconnect', 'Welcome'] as const;
export type Goal = typeof goals[number];
export const segments = ['All fans', 'New fans', 'Recent buyers', 'Repeat buyers', 'Spend threshold', 'Inactive fans', 'Selected fans'] as const;
export type Segment = typeof segments[number];
export type Config = {
  id: string; creatorId: string; name: string; goal: Goal; platforms: Platform[];
  segment: Segment; days: number; spend: number; fanIds: string[]; bothChannels: boolean;
  itemId: string; messages: Record<Platform, { text: string; price: number }>;
  followUp: { enabled: boolean; hours: number; text: string }; scheduledAt: string;
};
export type Recipient = {
  fanId: string; platform: Platform; state: 'Queued' | 'Sent' | 'Excluded'; reason?: string;
  messageId: string; sentAt?: string; followUpAt?: string;
  followUpState?: 'Scheduled' | 'Sent' | 'Stopped'; followUpReason?: string; followUpSentAt?: string;
};
export type Exclusion = { fanId: string; reason: string };
export type Campaign = Config & {
  status: Status; createdAt: string; startedAt?: string; completedAt?: string;
  recipients: Recipient[]; exclusions: Exclusion[];
  activity: { id: string; at: string; text: string }[];
};
export type CampaignStore = { version: 1; campaigns: Campaign[] };
export type Context = { fans: Fan[]; items: LibraryItem[]; sales: Sale[]; workspace: WorkspaceState; inbox: InboxState; audRate?: number };
export const freshConfig = (creatorId: string, id: string): Config => ({
  id, creatorId, name: '', goal: 'New content', platforms: ['onlyfans', 'telegram'],
  segment: 'All fans', days: 30, spend: 100, fanIds: [], bothChannels: false, itemId: '',
  messages: { onlyfans: { text: 'Hey {first_name}, I have something new to share with you. Have a look when you get a quiet moment x', price: 29 }, telegram: { text: 'Hey {first_name}, I have something new to share with you. Have a look when you get a quiet moment x', price: 2000 }, whatsapp: { text: 'Hi {first_name}, how has your week been? Hope your plans are coming together.', price: 29 } },
  followUp: { enabled: false, hours: 48, text: 'Hey {first_name}, leaving this here for when you have a quiet moment. No rush x' }, scheduledAt: '',
});
export const emptyCampaigns = (): CampaignStore => ({ version: 1, campaigns: [] });
export const personalized = (text: string, fan: Fan) => text.replaceAll('{first_name}', fan.name.split(' ')[0]).replaceAll('{name}', fan.name);
const ms = (at: string) => Date.parse(at);
const DAY = 86400000;
const isDate = (at: unknown): at is string => typeof at === 'string' && Number.isFinite(ms(at));
export function brisbaneInput(at: string) { return new Date(ms(at) + 10 * 3600000).toISOString().slice(0, 16); }
export function fromBrisbaneInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return '';
  const stamp = ms(`${value}:00+10:00`);
  if (!Number.isFinite(stamp)) return '';
  const at = new Date(stamp).toISOString();
  return brisbaneInput(at) === value ? at : '';
}
export const campaignHref = (creator: string, id = '', section = 'Overview') => `/campaigns?${new URLSearchParams({ creator, ...(id ? { campaign: id, view: 'detail', section } : {}) })}`;

export function audience(config: Config, ctx: Context, at: string) {
  const candidates = ctx.fans.filter(f => f.creatorId === config.creatorId && ms(f.firstSeen) <= ms(at));
  const item = ctx.items.find(i => i.id === config.itemId && i.creatorId === config.creatorId);
  const pastSales = ctx.sales.filter(s => ms(s.at) <= ms(at));
  const excluded: Exclusion[] = [];
  const recipients: Recipient[] = [];
  let matchingFans = 0;
  for (const fan of candidates) {
    const purchases = fan.purchases.filter(p => ms(p.at) <= ms(at));
    const recent = purchases.filter(p => ms(p.at) >= ms(at) - config.days * DAY);
    const messages = messagesFor(fan, ctx.workspace, 'all').filter(m => ms(m.at) <= ms(at));
    const lastIncoming = messages.filter(m => m.direction === 'in').at(-1)?.at || fan.firstSeen;
    const matches = config.segment === 'All fans' ||
      config.segment === 'New fans' && ms(fan.firstSeen) >= ms(at) - config.days * DAY ||
      config.segment === 'Recent buyers' && recent.length > 0 ||
      config.segment === 'Repeat buyers' && recent.length >= 2 ||
      config.segment === 'Spend threshold' && recent.reduce((n, p) => n + valueCents(p, 'USD'), 0) >= Math.round(config.spend * 100) ||
      config.segment === 'Inactive fans' && ms(lastIncoming) <= ms(at) - config.days * DAY ||
      config.segment === 'Selected fans' && config.fanIds.includes(fan.id);
    if (!matches) continue;
    matchingFans++;
    let channels = fan.accounts.filter(a => config.platforms.includes(a.platform) && ms(a.linkedAt) <= ms(at)).map(a => a.platform);
    if (!channels.length) { excluded.push({ fanId: fan.id, reason: 'No selected platform account' }); continue; }
    if (config.itemId && (!item || item.status !== 'Published')) { excluded.push({ fanId: fan.id, reason: 'Content unavailable' }); continue; }
    if (item && (ownership(item, fan, ctx.items, pastSales).length || item.kind === 'Bundle' && item.members.length > 0 && item.members.every(id => { const member = ctx.items.find(i => i.id === id); return member && ownership(member, fan, ctx.items, pastSales).length > 0; }))) {
      excluded.push({ fanId: fan.id, reason: 'Already owns content' }); continue;
    }
    if (item) channels = channels.filter(p => item.listings[p].enabled);
    if (!channels.length) { excluded.push({ fanId: fan.id, reason: 'Content not listed on fan’s platforms' }); continue; }
    channels = channels.filter(p => effectiveMode(fan, p, ctx.workspace, ctx.inbox) !== 'Human');
    if (!channels.length) { excluded.push({ fanId: fan.id, reason: 'Human handling' }); continue; }
    channels = channels.filter(p => { const follow = ctx.inbox.threads[channelKey(fan.id, p)]?.followUp; return !follow || follow.paused; });
    if (!channels.length) { excluded.push({ fanId: fan.id, reason: 'Existing conversation follow-up' }); continue; }
    channels.sort((a, b) => {
      const last = (p: Platform) => messages.filter(m => m.platform === p).at(-1)?.at || fan.firstSeen;
      return ms(last(b)) - ms(last(a)) || config.platforms.indexOf(a) - config.platforms.indexOf(b);
    });
    for (const platform of config.bothChannels ? channels : channels.slice(0, 1)) recipients.push({ fanId: fan.id, platform, state: 'Queued', messageId: `campaign:${config.id}:${fan.id}:${platform}` });
    // A fan is counted once. Platform-level exclusions do not subtract him again.
  }
  return { recipients, excluded, matchingFans, fans: new Set(recipients.map(r => r.fanId)).size, deliveries: recipients.length,
    platforms: { onlyfans: recipients.filter(r => r.platform === 'onlyfans').length, telegram: recipients.filter(r => r.platform === 'telegram').length, whatsapp: recipients.filter(r => r.platform === 'whatsapp').length } };
}

export function validateConfig(config: Config, ctx: Context, at: string, complete = true): string {
  if (!ctx.fans.some(f => f.creatorId === config.creatorId)) return 'Choose a creator.';
  if (!config.name.trim() || config.name.length > 140) return 'Enter a campaign name of up to 140 characters.';
  if (!config.platforms.length || new Set(config.platforms).size !== config.platforms.length || config.platforms.some(p => !['onlyfans', 'telegram', 'whatsapp'].includes(p))) return 'Choose at least one platform.';
  if (!segments.includes(config.segment) || !goals.includes(config.goal)) return 'Choose a valid purpose and audience.';
  if (!Number.isInteger(config.days) || config.days < 1 || config.days > 365 || !Number.isFinite(config.spend) || config.spend < 0 || config.spend > 1_000_000) return 'Check the audience period and spending threshold.';
  if (!complete) return '';
  if (config.goal === 'Paid offer' && !config.itemId) return 'Select content for the paid offer.';
  const item = ctx.items.find(i => i.id === config.itemId && i.creatorId === config.creatorId);
  if (config.itemId && (!item || item.status !== 'Published')) return 'Select published content from this creator’s library.';
  for (const platform of config.platforms) {
    const message = config.messages[platform];
    if (!message?.text.trim() || message.text.length > 2000) return `Add a message of up to 2,000 characters for ${platformNames[platform]}.`;
    if (item && (!Number.isFinite(message.price) || message.price <= 0 || message.price > 1_000_000 || platform === 'telegram' && !Number.isInteger(message.price))) return 'Use a positive USD price and a whole-Star Telegram price.';
    if (item && !item.listings[platform].enabled) return `This content is not listed on ${platformNames[platform]}. Choose another item or deselect this platform.`;
  }
  if (config.followUp.enabled && (!config.followUp.text.trim() || config.followUp.text.length > 2000 || !Number.isInteger(config.followUp.hours) || config.followUp.hours < 1 || config.followUp.hours > 168)) return 'Set a follow-up message and a delay from 1 to 168 hours.';
  if (config.scheduledAt && (!isDate(config.scheduledAt) || ms(config.scheduledAt) <= ms(at))) return 'Choose a future schedule in Brisbane time.';
  if (!audience(config, ctx, at).fans) return 'No eligible fans match this audience. Adjust the audience, platforms or content.';
  return '';
}
export function createCampaign(config: Config, ctx: Context, at: string, draft = false): Campaign {
  const preview = audience(config, ctx, at);
  return { ...structuredClone(config), status: draft ? 'Draft' : config.scheduledAt ? 'Scheduled' : 'Active', createdAt: at,
    ...(draft || config.scheduledAt ? {} : { startedAt: at }),
    recipients: draft || config.scheduledAt ? [] : preview.recipients, exclusions: preview.excluded,
    activity: [{ id: `${config.id}:created`, at, text: draft ? 'Draft saved.' : config.scheduledAt ? 'Campaign scheduled in Brisbane time.' : `Campaign started for ${preview.fans} fans across ${preview.deliveries} messages.` }] };
}
export function changeStatus(campaign: Campaign, status: Status, at: string): Campaign {
  return { ...campaign, status, activity: [...campaign.activity, { id: `${campaign.id}:${status}:${at}`, at, text: status === 'Paused' ? 'Campaign paused. Queued messages and follow-ups held.' : status === 'Active' ? 'Campaign resumed.' : `Campaign marked ${status.toLowerCase()}.` }].slice(-150) };
}
export function tickCampaign(campaign: Campaign, ctx: Context, at: string, batch = 8): Campaign {
  if (campaign.status !== 'Active' && campaign.status !== 'Scheduled') return campaign;
  let next = campaign;
  if (next.status === 'Scheduled') {
    if (!next.scheduledAt || ms(next.scheduledAt) > ms(at)) return next;
    const config = { ...next, scheduledAt: '' };
    const error = validateConfig(config, ctx, at);
    if (error) return { ...changeStatus(next, 'Paused', at), activity: [...next.activity, { id: `${next.id}:blocked:${at}`, at, text: `Scheduled start held: ${error}` }] };
    const preview = audience(config, ctx, at);
    next = { ...next, status: 'Active', startedAt: at, recipients: preview.recipients, exclusions: preview.excluded, activity: [...next.activity, { id: `${next.id}:started`, at, text: `Scheduled campaign started for ${preview.fans} fans.` }] };
  }
  let processed = 0, changes = 0;
  const item = ctx.items.find(i => i.id === next.itemId);
  const recipients = next.recipients.map(recipient => {
    const fan = ctx.fans.find(f => f.id === recipient.fanId && f.creatorId === next.creatorId);
    if (!fan) { if (recipient.state === 'Excluded') return recipient; changes++; return { ...recipient, state: 'Excluded' as const, reason: 'Relationship unavailable', followUpState: recipient.followUpState === 'Scheduled' ? 'Stopped' as const : recipient.followUpState }; }
    if (recipient.state === 'Queued' && processed < batch) {
      processed++; changes++;
      const config = { ...next, segment: 'Selected fans' as const, fanIds: [fan.id], platforms: [recipient.platform] };
      const check = audience(config, ctx, at);
      if (!check.recipients.length) return { ...recipient, state: 'Excluded' as const, reason: check.excluded[0]?.reason || 'No longer eligible' };
      return { ...recipient, state: 'Sent' as const, sentAt: at,
        ...(next.followUp.enabled ? { followUpAt: new Date(ms(at) + next.followUp.hours * 3600000).toISOString(), followUpState: 'Scheduled' as const } : {}) };
    }
    if (recipient.state !== 'Sent' || recipient.followUpState !== 'Scheduled' || !recipient.sentAt) return recipient;
    const inbound = messagesFor(fan, ctx.workspace, 'all').some(m => m.direction === 'in' && ms(m.at) > ms(recipient.sentAt!) && ms(m.at) <= ms(at));
    const bought = fan.purchases.some(p => ms(p.at) > ms(recipient.sentAt!) && ms(p.at) <= ms(at));
    const thread = ctx.inbox.threads[channelKey(fan.id, recipient.platform)];
    const reason = effectiveMode(fan, recipient.platform, ctx.workspace, ctx.inbox) === 'Human' ? 'Human takeover' : bought ? 'Fan purchased' : inbound ? 'Fan replied' : thread?.followUp && !thread.followUp.paused ? 'Conversation follow-up already scheduled' : thread?.resolved ? 'Conversation resolved' : item && ownership(item, fan, ctx.items, ctx.sales.filter(s => ms(s.at) <= ms(at))).length ? 'Content already owned' : '';
    if (reason) { changes++; return { ...recipient, followUpState: 'Stopped' as const, followUpReason: reason }; }
    if (recipient.followUpAt && ms(recipient.followUpAt) <= ms(at) && processed < batch) { processed++; changes++; return { ...recipient, followUpState: 'Sent' as const, followUpSentAt: at }; }
    return recipient;
  });
  const finished = !recipients.some(r => r.state === 'Queued' || r.followUpState === 'Scheduled');
  const completed = finished && next.status === 'Active';
  if (!changes && !completed && next === campaign) return campaign;
  return { ...next, recipients, ...(completed ? { status: 'Completed' as const, completedAt: at,
    activity: [...next.activity, { id: `${next.id}:completed`, at, text: 'Campaign completed. All queued messages and follow-ups resolved.' }].slice(-150) } : {}) };
}

export type Attribution = { campaignId: string; recipient: Recipient; sale: Sale };
export function attributeSales(campaigns: Campaign[], sales: Sale[]): Attribution[] {
  const result: Attribution[] = [];
  const deliveries = new Map<string, { campaign: Campaign; recipient: Recipient }[]>();
  for (const campaign of campaigns) for (const recipient of campaign.recipients) {
    if (recipient.state !== 'Sent' || !recipient.sentAt) continue;
    const key = `${recipient.fanId}:${recipient.platform}`;
    deliveries.set(key, [...(deliveries.get(key) || []), { campaign, recipient }]);
  }
  for (const sale of sales) {
    const candidates = (deliveries.get(`${sale.fan.id}:${sale.platform}`) || []).filter(({ campaign: c, recipient: r }) => c.creatorId === sale.fan.creatorId && (!c.itemId || c.itemId === sale.itemId) && ms(r.sentAt!) < ms(sale.at) && ms(sale.at) <= ms(r.sentAt!) + 7 * DAY)
      .map(({ campaign, recipient }) => ({ campaignId: campaign.id, recipient, sale }));
    candidates.sort((a, b) => ms(b.recipient.sentAt!) - ms(a.recipient.sentAt!) || a.campaignId.localeCompare(b.campaignId));
    if (candidates[0]) result.push(candidates[0]);
  }
  return result;
}
export function campaignStats(campaigns: Campaign[], ctx: Context, currency: DisplayCurrency, platform: Platform | 'all' = 'all', range?: { from: string; to: string }, allCampaigns = campaigns) {
  const inRange = (at: string) => !range || dayAt(at) >= range.from && dayAt(at) <= range.to;
  const sent = campaigns.flatMap(c => c.recipients.filter(r => r.state === 'Sent' && r.sentAt && inRange(r.sentAt) && (platform === 'all' || r.platform === platform)).map(r => ({ campaign: c, recipient: r })));
  const ids = new Set(campaigns.map(c => c.id));
  const sales = attributeSales(allCampaigns, ctx.sales).filter(a => ids.has(a.campaignId) && inRange(a.sale.at) && (platform === 'all' || a.sale.platform === platform));
  const replies = sent.filter(({ recipient: r }) => ctx.fans.find(f => f.id === r.fanId)?.messages.some(m => m.platform === r.platform && m.direction === 'in' && ms(m.at) > ms(r.sentAt!) && ms(m.at) <= ms(r.sentAt!) + 7 * DAY && inRange(m.at)));
  return { sent: sent.length, reached: new Set(sent.map(s => s.recipient.fanId)).size, replies: new Set(replies.map(s => s.recipient.fanId)).size,
    buyers: new Set(sales.map(a => a.sale.fan.id)).size, purchases: sales.length, revenue: sales.reduce((n, a) => n + valueCents(a.sale, currency, ctx.audRate), 0), sales };
}
export function mirrorCampaigns(campaigns: Campaign[], ctx: Context) {
  const workspace = { ...ctx.workspace, messages: { ...ctx.workspace.messages } };
  const offers = [...ctx.inbox.offers];
  for (const campaign of campaigns) for (const r of campaign.recipients) {
    if (r.state !== 'Sent' || !r.sentAt) continue;
    const fan = ctx.fans.find(f => f.id === r.fanId && f.creatorId === campaign.creatorId);
    if (!fan || !fan.accounts.some(a => a.platform === r.platform)) continue;
    const item = ctx.items.find(i => i.id === campaign.itemId);
    const extras = [...(workspace.messages[fan.id] || [])];
    const append = (message: Message) => { if (!fan.messages.some(m => m.id === message.id) && !extras.some(m => m.id === message.id)) extras.push(message); };
    append({ id: r.messageId, at: r.sentAt, platform: r.platform, direction: 'out', text: personalized(campaign.messages[r.platform].text, fan) });
    if (r.followUpState === 'Sent' && r.followUpSentAt) append({ id: `${r.messageId}:followup`, at: r.followUpSentAt, platform: r.platform, direction: 'out', text: personalized(campaign.followUp.text, fan) });
    workspace.messages[fan.id] = extras.sort((a, b) => a.at.localeCompare(b.at)).slice(-200);
    if (item && r.platform !== 'whatsapp' && !offers.some(o => o.messageId === r.messageId)) offers.push({ id: `${r.messageId}:offer`, messageId: r.messageId, fanId: r.fanId, platform: r.platform, itemId: item.id, title: item.title, amount: campaign.messages[r.platform].price, currency: r.platform === 'telegram' ? 'Stars' : 'USD', at: r.sentAt });
  }
  return { workspace, inbox: { ...ctx.inbox, offers: offers.slice(-200) } };
}

export function seedCampaigns(ctx: Context): CampaignStore {
  const result: Campaign[] = [];
  const seed = (id: string, name: string, at: string, goal: Goal, platforms: Platform[], status: Status, cap: number, itemId = '') => {
    const config = { ...freshConfig('briana', id), name, goal, platforms, itemId };
    if (id === 'briana-recent-buyers') config.segment = 'Recent buyers';
    const item = ctx.items.find(i => i.id === itemId);
    if (item) for (const p of platforms) config.messages[p] = { text: `Hey {first_name}, ${item.title} is ready. I have kept the contents clear so you can check it against your library. Have a look when you get a moment x`, price: item.listings[p].price };
    if (goal === 'Reconnect') for (const p of platforms) config.messages[p].text = p === 'whatsapp' ? 'Hi {first_name}, hope your week is going well. How are your plans coming together?' : 'Hey {first_name}, it has been a little while. How has your week been? I have added a few new collections if you feel like a browse x';
    const preview = audience(config, { ...ctx, workspace: emptyState(), inbox: emptyInbox() }, at);
    const chosen = [...new Set(preview.recipients.map(r => r.fanId))].slice(0, cap);
    config.segment = 'Selected fans'; config.fanIds = chosen;
    const campaign = createCampaign(config, { ...ctx, workspace: emptyState(), inbox: emptyInbox() }, at);
    campaign.status = status; campaign.startedAt = at;
    campaign.recipients = campaign.recipients.map(r => ({ ...r, state: 'Sent', sentAt: at }));
    if (status === 'Completed') { campaign.completedAt = new Date(ms(at) + 7 * DAY).toISOString(); campaign.activity.push({ id: `${id}:completed`, at: campaign.completedAt, text: 'Campaign completed. Results reconciled to recipient and purchase records.' }); }
    if (status === 'Active') {
      campaign.followUp = { enabled: true, hours: 48, text: 'Hey {first_name}, just leaving this here for your next quiet moment. No rush x' };
      campaign.recipients = campaign.recipients.map(r => ({ ...r, followUpAt: new Date(ms(at) + 48 * 3600000).toISOString(), followUpState: 'Scheduled' }));
    }
    result.push(campaign);
  };
  const journal = ctx.items.find(i => i.creatorId === 'briana' && i.title === 'October journal');
  seed('briana-october-release', 'October collection release', '2026-09-30T07:00:00Z', 'Paid offer', ['onlyfans'], 'Completed', 180, journal?.id || '');
  seed('briana-returning-fans', 'Returning fans', '2026-09-12T06:00:00Z', 'Reconnect', ['telegram'], 'Completed', 220);
  seed('briana-whatsapp-catchups', 'WhatsApp catch-ups', '2026-10-06T07:00:00Z', 'Reconnect', ['whatsapp'], 'Completed', 24);
  seed('briana-recent-buyers', 'Recent buyers', '2026-10-09T06:00:00Z', 'New content', ['onlyfans', 'telegram'], 'Active', 120);
  const morning = ctx.items.find(i => i.creatorId === 'briana' && i.title === 'Morning light');
  const weekend = { ...freshConfig('briana', 'briana-weekend-release'), name: 'Weekend content release', itemId: morning?.id || '', scheduledAt: '2026-10-10T09:00:00Z' };
  if (morning) for (const p of weekend.platforms) weekend.messages[p].price = morning.listings[p].price;
  result.push(createCampaign(weekend, ctx, '2026-10-09T07:10:00Z'));
  const welcome = { ...freshConfig('briana', 'briana-new-fans'), name: 'New fan welcome', goal: 'Welcome' as const, platforms: ['onlyfans'] as Platform[], segment: 'New fans' as const, days: 30 };
  welcome.messages.onlyfans.text = 'Hey {first_name}, lovely to have you here. What brought you over? I would love to know a little about you x';
  result.push(createCampaign(welcome, ctx, '2026-10-09T07:15:00Z', true));
  return { version: 1, campaigns: result };
}

export function restoreCampaigns(raw: string | null, fallback: CampaignStore, ctx: Context): CampaignStore {
  if (!raw || raw.length > 2_000_000) return fallback;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.campaigns) || value.campaigns.length > 100) return fallback;
    const ids = new Set<string>();
    const campaigns: Campaign[] = [];
    for (const saved of value.campaigns) {
      const c = saved?.messages ? { ...saved, messages: { ...freshConfig(saved.creatorId, saved.id).messages, ...saved.messages } } : saved;
      if (!c || typeof c.id !== 'string' || c.id.length > 150 || ids.has(c.id) || typeof c.name !== 'string' || !isDate(c.createdAt) || !statuses.includes(c.status) || !Array.isArray(c.platforms) || !Array.isArray(c.fanIds) || !Array.isArray(c.recipients) || !Array.isArray(c.exclusions) || !Array.isArray(c.activity) || !c.messages?.onlyfans || !c.messages?.telegram || !c.followUp) continue;
      if (typeof c.itemId !== 'string' || typeof c.bothChannels !== 'boolean' || typeof c.followUp.enabled !== 'boolean' || typeof c.followUp.text !== 'string' || c.followUp.text.length > 2000 || !Number.isInteger(c.followUp.hours) || c.followUp.hours < 1 || c.followUp.hours > 168 || typeof c.scheduledAt !== 'string' || c.scheduledAt && !isDate(c.scheduledAt) || c.startedAt && !isDate(c.startedAt) || c.completedAt && !isDate(c.completedAt)) continue;
      if (['onlyfans', 'telegram', 'whatsapp'].some(p => typeof c.messages[p].text !== 'string' || c.messages[p].text.length > 2000 || !Number.isFinite(c.messages[p].price) || c.messages[p].price <= 0 || c.messages[p].price > 1_000_000 || p === 'telegram' && !Number.isInteger(c.messages[p].price))) continue;
      if (validateConfig(c, ctx, c.createdAt, false)) continue;
      const creatorFans = ctx.fans.filter(f => f.creatorId === c.creatorId);
      const fanIds = new Set(creatorFans.map(f => f.id));
      const keys = new Set<string>();
      const recipients = c.recipients.slice(0, 1500).filter((r: Recipient) => {
        const fan = creatorFans.find(f => f.id === r?.fanId), key = `${r?.fanId}:${r?.platform}`;
        if (!fan || !c.platforms.includes(r.platform) || !fan.accounts.some(a => a.platform === r.platform) || keys.has(key) || !['Queued', 'Sent', 'Excluded'].includes(r.state) || r.messageId !== `campaign:${c.id}:${r.fanId}:${r.platform}` || r.state === 'Sent' && (!isDate(r.sentAt) || ms(r.sentAt) < ms(fan.firstSeen)) || r.followUpAt && !isDate(r.followUpAt) || r.followUpSentAt && !isDate(r.followUpSentAt) || r.followUpState && !['Scheduled', 'Sent', 'Stopped'].includes(r.followUpState)) return false;
        keys.add(key); return true;
      }).map((r: Recipient) => ({ ...r, reason: typeof r.reason === 'string' ? r.reason.slice(0, 200) : undefined, followUpReason: typeof r.followUpReason === 'string' ? r.followUpReason.slice(0, 200) : undefined }));
      ids.add(c.id);
      campaigns.push({ ...c, fanIds: c.fanIds.filter((id: unknown) => typeof id === 'string' && fanIds.has(id)), recipients,
        exclusions: c.exclusions.filter((e: Exclusion) => fanIds.has(e?.fanId) && typeof e.reason === 'string').map((e: Exclusion) => ({ fanId: e.fanId, reason: e.reason.slice(0, 200) })),
        activity: c.activity.filter((a: Campaign['activity'][number]) => typeof a?.id === 'string' && isDate(a.at) && typeof a.text === 'string').slice(-150).map((a: Campaign['activity'][number]) => ({ ...a, text: a.text.slice(0, 1000) })) });
    }
    // Introduce the third-channel showcase without replacing saved campaigns.
    if (value.campaigns.length && !ids.has('briana-whatsapp-catchups')) {
      const showcase = fallback.campaigns.find(c => c.id === 'briana-whatsapp-catchups');
      if (showcase) campaigns.push(structuredClone(showcase));
    }
    return campaigns.length || !value.campaigns.length ? { version: 1, campaigns } : fallback;
  } catch { return fallback; }
}
