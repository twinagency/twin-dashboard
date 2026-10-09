'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Clock3, Copy, Megaphone, Plus, Search, Send, X } from 'lucide-react';
import { useBlur } from '../BlurProvider';
import { useCurrency } from '../CurrencyProvider';
import { withBriannaLedger } from '../fans/brianna-ledger';
import { emptyState, restoreState, STORAGE_KEY } from '../fans/model';
import type { Creator, Fan, Platform, WorkspaceState } from '../fans/types';
import { buildLibrary, LIBRARY_STORAGE, restoreLibrary, type LibraryItem } from '../content-library/model';
import { emptyInbox, INBOX_STORAGE, restoreInbox, type InboxState } from '../inbox/model';
import { displayMoney, filterParams, parseFilters, rangeFor, type Filters } from '../dashboard/model';
import { audience, CAMPAIGN_STORAGE, campaignStats, changeStatus, createCampaign, freshConfig, mirrorCampaigns, restoreCampaigns, seedCampaigns, statuses, tickCampaign, validateConfig, type Campaign, type CampaignStore, type Config, type Context } from './model';
import CampaignBuilder from './CampaignBuilder';
import CampaignDetails, { detailSections } from './CampaignDetails';
import { Badge, date, Metrics, StatusBadge, time } from './ui';
import styles from './Campaigns.module.css';

type View = 'list' | 'builder' | 'detail';
const uid = () => crypto.randomUUID();
const noMedia: LibraryItem[] = [];
export default function Campaigns({ creators, fans: seedFans, mediaItems = noMedia, initialFilters, initialId = '', initialView = 'list', initialSection = 'Overview' }: {
  creators: Creator[]; fans: Fan[]; mediaItems?: LibraryItem[]; initialFilters: Filters; initialId?: string; initialView?: string; initialSection?: string;
}) {
  const fans = useMemo(() => withBriannaLedger(seedFans), [seedFans]);
  const base = useMemo(() => { const library = buildLibrary(fans); return { ...library, items: [...mediaItems, ...library.items] }; }, [fans, mediaItems]);
  const seed = useMemo(() => seedCampaigns({ fans, items: base.items, sales: base.sales, workspace: emptyState(), inbox: emptyInbox() }), [fans, base]);
  const [store, setStore] = useState<CampaignStore>(seed), [workspace, setWorkspace] = useState<WorkspaceState>(emptyState), [inbox, setInbox] = useState<InboxState>(emptyInbox), [items, setItems] = useState(base.items), [ready, setReady] = useState(false);
  const [filters, setFilters] = useState(initialFilters), [selectedId, setSelectedId] = useState(initialId), [view, setView] = useState<View>(initialView === 'builder' ? 'builder' : initialView === 'detail' ? 'detail' : 'list'), [section, setSection] = useState(detailSections.includes(initialSection) ? initialSection : 'Overview');
  const [form, setForm] = useState<Config>(() => freshConfig(initialFilters.creatorId, '')), [formKey, setFormKey] = useState(0), [query, setQuery] = useState(''), [status, setStatus] = useState('All'), [toast, setToast] = useState(''), [error, setError] = useState('');
  const { blurred } = useBlur(); const { rate } = useCurrency();
  const context = useMemo<Context>(() => ({ fans, items, sales: base.sales, workspace, inbox, audRate: rate }), [fans, items, base, workspace, inbox, rate]);
  const latestContext = (): Context => {
    try { return { ...context, workspace: restoreState(localStorage.getItem(STORAGE_KEY), fans), inbox: restoreInbox(localStorage.getItem(INBOX_STORAGE), fans), items: restoreLibrary(localStorage.getItem(LIBRARY_STORAGE), base.items) }; }
    catch { return context; }
  };
  useEffect(() => {
    try {
      const restoredWorkspace = restoreState(localStorage.getItem(STORAGE_KEY), fans), restoredInbox = restoreInbox(localStorage.getItem(INBOX_STORAGE), fans), restoredItems = restoreLibrary(localStorage.getItem(LIBRARY_STORAGE), base.items);
      const restored = restoreCampaigns(localStorage.getItem(CAMPAIGN_STORAGE), seed, { fans, items: restoredItems, sales: base.sales, workspace: restoredWorkspace, inbox: restoredInbox });
      setWorkspace(restoredWorkspace); setInbox(restoredInbox); setItems(restoredItems); setStore(restored);
      if (initialView === 'builder') setForm(restored.campaigns.find(c => c.id === initialId && c.creatorId === initialFilters.creatorId) || freshConfig(initialFilters.creatorId, uid()));
    } catch { setToast('Browser storage is unavailable. Changes will last for this session.'); if (initialView === 'builder') setForm(freshConfig(initialFilters.creatorId, uid())); }
    setReady(true);
  }, [fans, base, seed]);
  useEffect(() => {
    if (!ready) return;
    const fresh = latestContext();
    const mirrored = mirrorCampaigns(store.campaigns, fresh);
    setWorkspace(mirrored.workspace); setInbox(mirrored.inbox);
    try {
      // Merge against the latest state before writing, so unrelated operator
      // notes, drafts, takeovers and content edits survive campaign actions.
      for (const [key, value] of [[STORAGE_KEY, mirrored.workspace], [INBOX_STORAGE, mirrored.inbox], [CAMPAIGN_STORAGE, store]] as const) {
        const json = JSON.stringify(value); if (localStorage.getItem(key) !== json) localStorage.setItem(key, json);
      }
    } catch { setToast('Browser storage is unavailable. Changes will last for this session.'); }
  }, [store, ready]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setWorkspace(restoreState(e.newValue, fans));
      if (e.key === INBOX_STORAGE) setInbox(restoreInbox(e.newValue, fans));
      if (e.key === LIBRARY_STORAGE) setItems(restoreLibrary(e.newValue, base.items));
      if (e.key === CAMPAIGN_STORAGE) setStore(restoreCampaigns(e.newValue, seed, latestContext()));
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [fans, base, seed]);
  useEffect(() => {
    if (!ready || !store.campaigns.some(c => c.status === 'Active' || c.status === 'Scheduled')) return;
    const timer = window.setInterval(() => {
      const fresh = latestContext(), at = new Date().toISOString();
      setStore(previous => { const campaigns = previous.campaigns.map(c => tickCampaign(c, fresh, at)); return campaigns.every((c, n) => c === previous.campaigns[n]) ? previous : { version: 1, campaigns }; });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, store, context]);
  const urlFor = (nextView: View, id = selectedId, nextSection = section) => {
    const params = filterParams(filters); if (nextView !== 'list') params.set('view', nextView); if (id && nextView !== 'list') params.set('campaign', id); if (nextView === 'detail') params.set('section', nextSection);
    return `/campaigns?${params}`;
  };
  const navigate = (nextView: View, id = '', nextSection = 'Overview') => { window.history.pushState(window.history.state, '', urlFor(nextView, id, nextSection)); setView(nextView); setSelectedId(id); setSection(nextSection); setError(''); };
  useEffect(() => { if (ready) window.history.replaceState(window.history.state, '', urlFor(view)); }, [filters, view, selectedId, section, ready]);
  useEffect(() => {
    const pop = () => { const p = new URLSearchParams(window.location.search); setFilters(parseFilters(p, creators)); setSelectedId(p.get('campaign') || ''); setView(p.get('view') === 'builder' ? 'builder' : p.get('view') === 'detail' ? 'detail' : 'list'); setSection(detailSections.includes(p.get('section') || '') ? p.get('section')! : 'Overview'); if (p.get('view') === 'builder') { setForm(store.campaigns.find(c => c.id === p.get('campaign')) || freshConfig(p.get('creator') || 'briana', uid())); setFormKey(n => n + 1); } };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, [store, creators]);
  const creator = creators.find(c => c.id === filters.creatorId)!;
  const scoped = store.campaigns.filter(c => c.creatorId === filters.creatorId);
  const range = rangeFor(filters, fans);
  const stats = campaignStats(scoped, context, filters.currency, filters.platform, range, store.campaigns);
  const campaigns = scoped.filter(c => (filters.platform === 'all' || c.platforms.includes(filters.platform)) && (status === 'All' || c.status === status) && `${c.name} ${c.goal}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = scoped.find(c => c.id === selectedId);
  const open = (c: Campaign) => navigate('detail', c.id);
  const newCampaign = () => { const config = freshConfig(filters.creatorId, uid()); if (filters.platform !== 'all') config.platforms = [filters.platform]; setForm(config); setFormKey(n => n + 1); navigate('builder', config.id); };
  const edit = (c: Campaign) => { setForm(structuredClone(c)); setFormKey(n => n + 1); navigate('builder', c.id); };
  const save = (draft: boolean) => {
    const fresh = latestContext(), at = new Date().toISOString();
    const config = { ...form, id: form.id || uid(), name: form.name.trim() };
    const invalid = validateConfig(config, fresh, at, !draft);
    if (invalid) { setError(invalid); return; }
    if (store.campaigns.length >= 100 && !store.campaigns.some(c => c.id === config.id)) { setError('This workspace has reached 100 campaigns. Edit an existing draft.'); return; }
    const campaign = createCampaign(config, fresh, at, draft);
    const previous = store.campaigns.find(c => c.id === campaign.id);
    if (previous) { campaign.createdAt = previous.createdAt; campaign.activity = [...previous.activity, { id: `${campaign.id}:edited:${at}`, at, text: draft ? 'Draft updated.' : campaign.status === 'Scheduled' ? 'Schedule updated.' : 'Campaign started.' }].slice(-150); }
    setStore(s => ({ version: 1, campaigns: [...s.campaigns.filter(c => c.id !== campaign.id), campaign] })); setFilters(f => ({ ...f, creatorId: campaign.creatorId })); setToast(draft ? 'Campaign draft saved.' : campaign.status === 'Scheduled' ? 'Campaign scheduled in Brisbane time.' : 'Campaign started. Sending progress is available below.'); navigate('detail', campaign.id);
  };
  const duplicate = (c: Campaign) => {
    if (store.campaigns.length >= 100) { setToast('This workspace has reached 100 campaigns.'); return; }
    const config = { ...structuredClone(c), id: uid(), name: `${c.name.slice(0, 130)} copy`, scheduledAt: '' };
    const campaign = createCampaign(config, latestContext(), new Date().toISOString(), true);
    setStore(s => ({ version: 1, campaigns: [...s.campaigns, campaign] })); setForm(campaign); setFormKey(n => n + 1); setToast('Campaign copied to a new draft.'); navigate('builder', campaign.id);
  };
  const toggle = (c: Campaign) => {
    const next = c.status === 'Paused' ? !c.startedAt && c.scheduledAt ? 'Scheduled' : 'Active' : 'Paused';
    setStore(s => ({ version: 1, campaigns: s.campaigns.map(x => x.id === c.id ? changeStatus(x, next, new Date().toISOString()) : x) })); setToast(next === 'Paused' ? 'Campaign paused. Queued messages and follow-ups are held.' : 'Campaign resumed.');
  };
  return <main className={styles.page}>
    {toast && <div role="status" className={styles.toast}><Check size={15} /><span>{toast}</span><button aria-label="Dismiss campaign notice" onClick={() => setToast('')}><X size={15} /></button></div>}
    {view === 'builder' ? <CampaignBuilder key={formKey} config={form} change={value => { setForm(value); setError(''); }} context={context} creators={creators} save={save} cancel={() => navigate('list')} error={error} ready={ready} blurred={blurred} /> : view === 'detail' ? selected ? <CampaignDetails key={selected.id} campaign={selected} allCampaigns={store.campaigns} context={context} currency={filters.currency} section={section} setSection={setSection} back={() => navigate('list')} edit={() => edit(selected)} duplicate={() => duplicate(selected)} toggle={() => toggle(selected)} blurred={blurred} /> : <div className={styles.empty}><Megaphone size={26} /><strong>{ready ? 'Campaign not found in this creator’s workspace' : 'Loading campaign…'}</strong><button className={styles.primary} onClick={() => navigate('list')}>All campaigns</button></div> : <>
      <header className={styles.heading}><div><div className={styles.eyebrow}>CREATOR WORKSPACE <span>{creator.name}</span></div><h1>Campaigns</h1><p>Reach the right fans. Share content. Follow every result.</p></div><div className={styles.headingActions}><label>Creator<select aria-label="Campaigns creator" value={filters.creatorId} onChange={e => { setFilters(f => ({ ...f, creatorId: e.target.value, platform: 'all' })); setStatus('All'); setQuery(''); }}>{creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className={styles.primary} disabled={!ready} onClick={newCampaign}><Plus size={16} />Create campaign</button></div></header>
      <div className={styles.scope}><div className={styles.tabs} aria-label="Campaigns platforms"><button aria-pressed={filters.platform === 'all'} onClick={() => setFilters(f => ({ ...f, platform: 'all' }))}>All platforms</button>{(['onlyfans', 'telegram'] as Platform[]).map(p => <button key={p} aria-pressed={filters.platform === p} onClick={() => setFilters(f => ({ ...f, platform: p }))}><Badge platform={p} /></button>)}</div><div className={styles.period}><select aria-label="Campaigns reporting period" value={filters.window} onChange={e => setFilters(f => ({ ...f, window: e.target.value as Filters['window'] }))}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="6m">Six months</option><option value="all">All time</option></select><select aria-label="Campaigns currency" value={filters.currency} onChange={e => setFilters(f => ({ ...f, currency: e.target.value as Filters['currency'] }))}><option value="USD">USD</option><option value="AUD">AUD</option></select></div></div>
      <div className={styles.rangeLabel}>{date(`${range.from}T00:00:00Z`)} – {date(`${range.to}T00:00:00Z`)}<span>Brisbane time · results period</span></div><Metrics stats={stats} currency={filters.currency} />
      <section className={styles.campaignList}><div className={styles.panelHeading}><div><h2>{creator.name}’s campaigns</h2><p>Inspect audiences, messages and completed purchases.</p></div><span className={styles.countLabel}>{scoped.length} campaigns</span></div><div className={styles.toolbar}><div className={styles.tabs} aria-label="Campaign status"><button aria-pressed={status === 'All'} onClick={() => setStatus('All')}>All ({scoped.length})</button>{statuses.filter(s => scoped.some(c => c.status === s)).map(s => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s} ({scoped.filter(c => c.status === s).length})</button>)}</div><div className={styles.search}><Search size={15} /><input aria-label="Search campaigns" placeholder="Search campaigns…" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
      <div className={styles.tableWrap}><table className={styles.campaignTable}><thead><tr><th>Campaign</th><th>Platforms</th><th>Status</th><th>Audience / progress</th><th>Results</th><th>Revenue</th><th>Timing</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{campaigns.map(c => { const rowStats = campaignStats([c], context, filters.currency, filters.platform, range, store.campaigns); const preview = c.recipients.length ? undefined : audience(c, context, new Date().toISOString()); const total = c.recipients.length || preview?.deliveries || 0, sent = c.recipients.filter(r => r.state === 'Sent').length; return <tr key={c.id}><td><div className={styles.campaignName}><span><Megaphone size={18} /></span><div><button aria-label={`Open campaign ${c.name}`} onClick={() => open(c)}>{c.name}</button><small>{c.goal}{c.itemId ? ` · ${items.find(i => i.id === c.itemId)?.kind || 'Content'}` : ' · Message'}</small></div></div></td><td><div className={styles.inlineBadges}>{c.platforms.map(p => <Badge key={p} platform={p} compact />)}</div></td><td><StatusBadge status={c.status} /></td><td><strong>{c.recipients.length ? new Set(c.recipients.map(r => r.fanId)).size : preview?.fans || 0} fans</strong><small>{sent} / {total} messages</small><div className={styles.progress}><i style={{ width: `${total ? sent / total * 100 : 0}%` }} /></div></td><td><strong>{rowStats.replies} replies</strong><small>{rowStats.buyers} buyers · {rowStats.purchases} purchases</small></td><td><strong>{displayMoney(rowStats.revenue, filters.currency)}</strong></td><td><span>{date(c.scheduledAt || c.startedAt || c.createdAt)}</span><small>{time(c.scheduledAt || c.startedAt || c.createdAt)} AEST</small></td><td><button className={styles.iconButton} aria-label={`View ${c.name} details`} onClick={() => open(c)}><ArrowUpRight size={15} /></button></td></tr>; })}</tbody></table></div>{!campaigns.length && <div className={styles.empty}><Megaphone size={27} /><strong>{scoped.length ? 'No campaigns match these filters' : 'Create your first campaign'}</strong><p>{scoped.length ? 'Try another name, platform or status.' : `Choose an audience and prepare a message for ${creator.name}’s fans.`}</p><button className={styles.secondary} onClick={scoped.length ? () => { setQuery(''); setStatus('All'); setFilters(f => ({ ...f, platform: 'all' })); } : newCampaign}>{scoped.length ? 'Clear filters' : 'Create campaign'}</button></div>}
      </section><p className={styles.footnote}>Each purchase is attributed once within seven days of a campaign message on its purchase platform. Attributed revenue is included in Dashboard revenue.</p>
    </>}
  </main>;
}
