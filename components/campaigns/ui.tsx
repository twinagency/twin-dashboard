import PlatformMark from '../fans/PlatformMark';
import { useEffect, useRef, type ReactNode } from 'react';
import { Check, ImageIcon, LockKeyhole, Send, X } from 'lucide-react';
import { platformNames } from '../fans/model';
import type { Fan, Platform } from '../fans/types';
import type { LibraryItem } from '../content-library/model';
import { displayMoney, type DisplayCurrency } from '../dashboard/model';
import { personalized, type Config, type Status } from './model';
import styles from './Campaigns.module.css';

export const date = (at?: string) => at ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(at)) : '—';
export const time = (at?: string) => at ? new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' }).format(new Date(at)) : '—';
export const originalPrice = (n: number, platform: Platform) => platform === 'telegram' ? `${n.toLocaleString('en-US')} Stars` : displayMoney(Math.round(n * 100), 'USD');
export function Badge({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  return <span className={`${styles.badge} ${styles[platform]}`} title={platformNames[platform]}><span>{platform === 'whatsapp' ? <PlatformMark platform={platform} size={15}/> : platform === 'telegram' ? 'TG' : 'OF'}</span>{!compact && platformNames[platform]}</span>;
}
export function Avatar({ fan }: { fan: Fan }) { return <span className={styles.avatar} style={{ background: `${fan.color}18`, color: fan.color }}>{fan.initials}</span>; }
export function StatusBadge({ status }: { status: Status }) { return <span className={`${styles.status} ${styles[status.toLowerCase()]}`}><i />{status}</span>; }
export function Metrics({ stats, currency }: { stats: { reached: number; replies: number; buyers: number; revenue: number }; currency: DisplayCurrency }) {
  return <section className={styles.metrics} aria-label="Campaign results">
    <div><span>Fans reached</span><strong data-campaign-metric="reached">{stats.reached.toLocaleString()}</strong><small>Unique fan relationships</small></div>
    <div><span>Replies</span><strong data-campaign-metric="replies">{stats.replies.toLocaleString()}</strong><small>Fans who replied within seven days</small></div>
    <div><span>Purchasing fans</span><strong data-campaign-metric="buyers">{stats.buyers.toLocaleString()}</strong><small>Unique attributed buyers</small></div>
    <div><span>Attributed revenue</span><strong data-campaign-metric="revenue">{displayMoney(stats.revenue, currency)}</strong><small>Completed purchases · seven-day window</small></div>
  </section>;
}
export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab') return;
      const controls = [...ref.current!.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea,select,[tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prior?.focus(); };
  }, []);
  return <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={styles.dialog}><header><h2>{title}</h2><button aria-label="Close campaign dialog" onClick={close}><X size={19} /></button></header>{children}</section></div>;
}
export function ContentCover({ item, blurred }: { item: LibraryItem; blurred: boolean }) {
  return item.preview ? <img className={blurred ? styles.blurred : ''} src={item.preview} alt={item.title} /> : <div className={styles.cover}><ImageIcon size={23} /><span>{item.kind}</span><strong>{item.title}</strong></div>;
}
export function MessagePreview({ config, platform, fan, item, blurred }: { config: Config; platform: Platform; fan: Fan; item?: LibraryItem; blurred: boolean }) {
  return <section className={styles.messagePreview} data-preview-platform={platform} aria-label={`${platformNames[platform]} message preview`}><header><Avatar fan={fan} /><div><strong>{fan.name}</strong><small>{platformNames[platform]} · Creator conversation</small></div><Badge platform={platform} compact /></header><div className={styles.previewBody}><div className={styles.messageBubble}>{personalized(config.messages[platform].text, fan)}{item && <div className={styles.offerPreview}><ContentCover item={item} blurred={blurred} /><div><span>{platform !== 'whatsapp' && <LockKeyhole size={13} />}{item.kind}</span><strong>{item.title}</strong><b>{platform === 'whatsapp' ? 'View content' : originalPrice(config.messages[platform].price, platform)}</b></div></div>}<small>Campaign message <Check size={12} /></small></div></div><footer><Send size={12} />Preview for {fan.name}</footer></section>;
}
