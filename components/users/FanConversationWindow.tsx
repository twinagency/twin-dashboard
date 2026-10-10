"use client";
import PlatformMark from '../fans/PlatformMark';

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Link2, Search, Send, Users } from "lucide-react";
import ChatThread, { type ThreadMessage } from "./ChatThread";
import { channelKey, conversationHref, conversationPlatform, emptyState, messagesFor, platformNames, profileHref, restoreState, STORAGE_KEY, totalsFor, visibleFans } from "../fans/model";
import { PLATFORMS, type Creator, type Fan, type Handling, type Platform, type PlatformFilter, type WorkspaceState } from "../fans/types";
import styles from "./FanConversationWindow.module.css";
import { withBriannaLedger } from "../fans/brianna-ledger";

const dateLabel = (at: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }).format(new Date(at));
const timeLabel = (at: string) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }).format(new Date(at));
const money = (amount: number, currency: "USD" | "Stars") => currency === "Stars" ? `${amount.toLocaleString("en-US")} Stars` : `US$${amount.toFixed(2)}`;

function Channel({ platform }: { platform: Platform }) {
  return <span className={styles.channel} data-platform={platform}><PlatformMark platform={platform} size={14}/> {platformNames[platform]}</span>;
}

/** Local relationship histories inside the existing /users inbox. No real-user actions or feed are mounted. */
export default function FanConversationWindow({ creators, fans: seedFans, initialFanId, initialPlatform, initialSourceId, includeBriannaLedger = false }: {
  creators: Creator[]; fans: Fan[]; initialFanId: string; initialPlatform?: string; initialSourceId?: string; includeBriannaLedger?: boolean;
}) {
  const fans = includeBriannaLedger ? withBriannaLedger(seedFans) : seedFans;
  const initialFan = fans.find(fan => fan.id === initialFanId)!;
  const initialSource = initialFan.messages.find(message => message.id === initialSourceId);
  const [creatorId, setCreatorId] = useState(initialFan.creatorId);
  const [selectedId, setSelectedId] = useState(initialFan.id);
  const [platform, setPlatform] = useState<Platform>(initialSource?.platform ?? conversationPlatform(initialFan, initialPlatform));
  const [sourceId, setSourceId] = useState(initialSource?.id);
  const [query, setQuery] = useState("");
  const [listPlatform, setListPlatform] = useState<PlatformFilter>("all");
  const [messageSearch, setMessageSearch] = useState("");
  const [state, setState] = useState<WorkspaceState>(emptyState);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [mobileList, setMobileList] = useState(false);
  const [notice, setNotice] = useState("");
  const filtered = visibleFans(fans, creatorId, query, listPlatform);
  const fan = filtered.find(item => item.id === selectedId) ?? filtered[0];
  const creator = creators.find(item => item.id === fan?.creatorId);
  const activePlatform = fan ? conversationPlatform(fan, platform) : platform;
  const key = fan ? channelKey(fan.id, activePlatform) : "";
  const draft = state.drafts[key] ?? "";
  const mode = state.modes[key] ?? "Copilot";
  const messages = fan ? messagesFor(fan, state, activePlatform) : [];
  const matching = messages.filter(message => message.text.toLowerCase().includes(messageSearch.trim().toLowerCase()));
  const totals = fan ? totalsFor(fan, activePlatform) : { purchases: [], usd: 0, stars: 0 };
  const selectedSource = messages.find(message => message.id === sourceId)?.id;
  const latest = messages.at(-1);
  const thread: ThreadMessage[] = matching.map((message, index) => {
    const day = dateLabel(message.at);
    const previous = matching[index - 1], next = matching[index + 1];
    return { id: message.id, fan: message.direction === "in", content: message.text, timeLabel: timeLabel(message.at),
      dayLabel: !previous || dateLabel(previous.at) !== day ? day : null,
      startsRun: !previous || previous.direction !== message.direction || dateLabel(previous.at) !== day,
      endsRun: !next || next.direction !== message.direction || dateLabel(next.at) !== day, kind: "text" };
  });
  useEffect(() => {
    try { setState(restoreState(localStorage.getItem(STORAGE_KEY), fans)); } catch { setStorageAvailable(false); }
    setReady(true);
  }, [fans]);
  useEffect(() => {
    setCreatorId(initialFan.creatorId); setSelectedId(initialFan.id);
    setPlatform(initialSource?.platform ?? conversationPlatform(initialFan, initialPlatform));
    setSourceId(initialSource?.id); setQuery(""); setListPlatform("all"); setMessageSearch("");
  }, [initialFan, initialPlatform, initialSource]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { setStorageAvailable(false); }
  }, [state, ready]);
  useEffect(() => {
    if (ready && fan) window.history.replaceState(window.history.state, "", conversationHref(fan, activePlatform, selectedSource));
  }, [ready, fan, activePlatform, selectedSource]);
  const chooseFan = (next: Fan) => {
    setSelectedId(next.id); setPlatform(conversationPlatform(next)); setSourceId(undefined);
    setMessageSearch(""); setNotice(""); setMobileList(false);
  };
  const chooseCreator = (id: string) => {
    setCreatorId(id); setQuery(""); setListPlatform("all"); setMessageSearch(""); setSourceId(undefined); setNotice("");
    const next = id === "all" ? fans[0] : fans.find(item => item.creatorId === id);
    if (next) { setSelectedId(next.id); setPlatform(conversationPlatform(next)); }
  };
  const updateDraft = (text: string) => setState(previous => ({ ...previous, drafts: { ...previous.drafts, [key]: text } }));
  const send = () => {
    if (!fan || !ready || !draft.trim()) return;
    const message = { id: crypto.randomUUID(), platform: activePlatform, direction: "out" as const, text: draft.trim(), at: new Date().toISOString() };
    setState(previous => ({ ...previous, messages: { ...previous.messages, [fan.id]: [...(previous.messages[fan.id] ?? []), message].slice(-200) },
      drafts: { ...previous.drafts, [key]: "" } }));
    setSourceId(undefined); setMessageSearch(""); setNotice("Message added to conversation");
  };
  return <div className={`users-workspace ${styles.workspace}`} data-fan-conversation-window="true">
    <div className={styles.heading}><div><span className={styles.eyebrow}>CONVERSATIONS</span><h1>Conversations</h1></div><Link href="/users" className={styles.textLink}>Live Telegram chats<ArrowUpRight size={14}/></Link></div>
    <button className={styles.mobileBrowse} onClick={() => setMobileList(value => !value)}><Users size={16}/>{mobileList ? "Hide fan list" : "Browse fans"}</button>
    <div className={styles.columns}>
      <aside className={`users-panel users-panel-list ${styles.fanList} ${mobileList ? styles.mobileVisible : ""}`} aria-label="Conversation fan browser">
        <div className={styles.filters}>
          <label htmlFor="conversation-creator">Creator</label><select id="conversation-creator" value={creatorId} onChange={event => chooseCreator(event.target.value)}><option value="all">All creators</option>{creators.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <div className={styles.search}><Search size={15}/><input aria-label="Search conversation fans" placeholder="Search fans or usernames" value={query} onChange={event => { setQuery(event.target.value); setSourceId(undefined); }}/></div>
          <select aria-label="Filter conversation fans by platform" value={listPlatform} onChange={event => { setListPlatform(event.target.value as PlatformFilter); setSourceId(undefined); }}><option value="all">Any platform</option>{PLATFORMS.map(item => <option key={item} value={item}>{platformNames[item]}</option>)}</select>
          <span className={styles.muted}>{filtered.length} relationships</span>
        </div>
        <div className={styles.fanRows}>{filtered.map(item => <button key={item.id} className={styles.fanRow} aria-label={`Open ${item.name} conversation with ${creators.find(owner => owner.id === item.creatorId)?.name}`} aria-pressed={fan?.id === item.id} onClick={() => chooseFan(item)}>
          <span className={styles.avatar} style={{ color: item.color, background: `${item.color}16` }}>{item.initials}</span><span><strong>{item.name}</strong><span className={styles.owner}>{creators.find(owner => owner.id === item.creatorId)?.name}</span><span className={styles.channels}>{item.accounts.map(account => <Channel key={account.platform} platform={account.platform}/>)}</span></span>
        </button>)}</div>
      </aside>
      {fan && creator ? <>
        <section data-chat-platform={activePlatform} className={`users-panel users-panel-chat ${styles.chat}`} aria-label={`${platformNames[activePlatform]} conversation with ${fan.name}`}>
          <div data-chat-header className={styles.chatHeader}><span className={styles.avatar} style={{ color: fan.color, background: `${fan.color}16` }}>{fan.initials}</span><div><h2>{fan.name}</h2><p>@{fan.accounts.find(account => account.platform === activePlatform)?.username} · {creator.name}</p></div><Link href={profileHref(fan)} className={styles.textLink}>Fan profile<ArrowUpRight size={14}/></Link></div>
          <div data-chat-tabs className={styles.platforms} aria-label="Conversation platform">{PLATFORMS.map(item => <button key={item} disabled={!fan.accounts.some(account => account.platform === item)} aria-pressed={activePlatform === item} onClick={() => { setPlatform(item); setSourceId(undefined); setMessageSearch(""); setNotice(""); }}><Channel platform={item}/></button>)}</div>
          <div className={styles.threadToolbar}><div className={styles.search}><Search size={14}/><input aria-label="Search conversation" placeholder="Search this conversation" value={messageSearch} onChange={event => { setMessageSearch(event.target.value); setSourceId(undefined); }}/></div><select aria-label="Conversation handling" value={mode} onChange={event => setState(previous => ({ ...previous, modes: { ...previous.modes, [key]: event.target.value as Handling } }))}><option>Human</option><option>Copilot</option><option>Autonomous</option></select></div>
          {selectedSource && <div className={styles.contextNotice}>Conversation context<button onClick={() => setSourceId(undefined)}>Latest messages</button></div>}
          <ChatThread appearance={activePlatform} fanId={`${fan.id}:${activePlatform}`} messages={thread} live={false} sourceMessageId={selectedSource} lastActiveLabel={latest ? `${dateLabel(latest.at)} · ${timeLabel(latest.at)}` : "unknown"} spentStars={totals.stars} spentLabel={money(activePlatform === "telegram" ? totals.stars : totals.usd, activePlatform === "telegram" ? "Stars" : "USD")} purchasedCount={totals.purchases.length}/>
          {messageSearch && !matching.length && <p className={styles.empty}>No messages match your search.</p>}
          <div data-chat-composer className={styles.composer}><div className={styles.composerHeading}><span>Reply on <strong>{platformNames[activePlatform]}</strong></span>{mode !== "Human" && <button className={styles.textLink} onClick={() => setState(previous => ({ ...previous, modes: { ...previous.modes, [key]: "Human" } }))}>Take over</button>}</div>
            <textarea aria-label={`Reply on ${platformNames[activePlatform]}`} placeholder={`Message ${fan.name} on ${platformNames[activePlatform]}…`} value={draft} maxLength={4000} onChange={event => updateDraft(event.target.value)}/>
            <div className={styles.composerActions}><button className={styles.secondaryButton} onClick={() => updateDraft(fan.suggestedReplies?.[activePlatform] ?? `Hey ${fan.name}! What have you been up to this week?`)}>Suggest reply</button><button className={styles.primaryButton} disabled={!draft.trim() || !ready} onClick={send} data-chat-send><Send size={14}/>Send</button></div>
            <span className={styles.notice} role="status">{notice}{!storageAvailable && " Browser saving is unavailable."}</span>
          </div>
        </section>
        <aside className={`users-panel users-panel-profile ${styles.context}`} aria-label="Conversation relationship">
          <div className={styles.contextSection}><span className={styles.eyebrow}>RELATIONSHIP</span><h3>{fan.name}</h3><p>Fan of <strong>{creator.name}</strong></p><Link href={profileHref(fan)} className={styles.primaryButton}>Open fan profile<ArrowUpRight size={14}/></Link></div>
          <div className={styles.contextSection}><h3><Link2 size={15}/>{fan.accounts.length} linked {fan.accounts.length === 1 ? "account" : "accounts"}</h3>{fan.accounts.map(account => <div className={styles.account} key={account.platform}><Channel platform={account.platform}/><span>@{account.username}</span></div>)}</div>
          <div className={styles.contextSection}><h3>Shared relationship memory</h3>{fan.memories.filter(memory => !fan.history || memory.category === "Open follow-ups").slice(0,4).map(memory => <div className={styles.memory} key={memory.id}><strong>{memory.label}</strong><p>{state.memories[fan.id]?.[memory.id] ?? memory.value}</p></div>)}<Link href={profileHref(fan,"memory")} className={styles.textLink}>View all {fan.memories.length} details<ArrowUpRight size={14}/></Link></div>
          <div className={styles.contextSection}><h3>Content ownership</h3><p>{totals.purchases.length} items on {platformNames[activePlatform]}</p><Link href={profileHref(fan,"purchases")} className={styles.textLink}>View purchases<ArrowUpRight size={14}/></Link></div>
        </aside>
      </> : <div className={styles.empty}>No fans match these filters. <button className={styles.textLink} onClick={() => { setQuery(""); setListPlatform("all"); }}>Clear filters</button></div>}
    </div>
  </div>;
}
