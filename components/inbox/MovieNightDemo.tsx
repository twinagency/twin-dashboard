'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Bot, Check, CheckCheck, ChevronRight, Clock3, Film, ImageIcon, LockKeyhole, MessageCircle, Pause, Play, RotateCcw, Send, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import PlatformMark from '../fans/PlatformMark';
import IntelligenceCoreIcon from '../IntelligenceCoreIcon';
import { portraitUrl } from '../dashboard/portraits';
import { fanAvatarUrl } from '../dashboard/fan-avatars';
import { DEMO_HISTORY, DEMO_MEMORIES, DEMO_OWNED, DEMO_PRICE, DEMO_SCENES, demoTotals, movieDemoReducer, restoreDemoProgress, demoConversationHref, demoProfileHref } from './movie-night-model';
import styles from './MovieNightDemo.module.css';

const dollars = (value: number) => `US$${value.toFixed(2)}`;

export default function MovieNightDemo({initialStep=0,initialMode}: {initialStep?: string | number; initialMode?: string} = {}) {
  const [state, dispatch] = useReducer(movieDemoReducer, {initialStep,initialMode}, value => restoreDemoProgress(value.initialStep,value.initialMode));
  const [presenter, setPresenter] = useState(false);
  const [tab, setTab] = useState<'Context' | 'Fan record'>('Context');
  const [source, setSource] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [speed, setSpeed] = useState(1);
  const [photoFailed, setPhotoFailed] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const scene = DEMO_SCENES[state.scene];
  const pending = scene?.events[state.cursor];
  const complete = state.scene === DEMO_SCENES.length - 1 && state.cursor === scene.events.length;
  const typing = state.playing && (pending?.kind === 'creator' || pending?.kind === 'offer');
  const recalling = state.playing && pending?.kind === 'context';
  const totals = demoTotals(state);
  const pauseForProfile = () => {
    dispatch({ type: 'pause' });
    window.history.replaceState(window.history.state, '', demoConversationHref(state));
  };
  const reset = () => { dispatch({ type: 'reset' }); setDraft(''); setSource(null); setTab('Context'); };

  useEffect(() => {
    if (state.playing && pending) {
      const timer = window.setTimeout(() => dispatch({ type: 'tick' }), pending.delay * speed);
      return () => window.clearTimeout(timer);
    }
    if (state.auto && !state.playing && state.mode === 'Autonomous' && !complete) {
      const timer = window.setTimeout(() => dispatch({ type: 'start' }), 3800 * speed);
      return () => window.clearTimeout(timer);
    }
  }, [state.playing, state.auto, state.mode, state.scene, state.cursor, pending, complete, speed]);

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [state.messages.length, typing, state.purchased]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || target?.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); setPresenter(value => !value); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); dispatch({ type: 'start', auto: false }); }
      if (event.key === ' ' && !target?.closest('button,a')) { event.preventDefault(); dispatch({ type: state.playing || state.auto ? 'pause' : 'start' }); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [state.playing, state.auto]);

  useEffect(() => {
    if (source) sourceDialog.current?.showModal();
    else sourceDialog.current?.close();
  }, [source]);

  return <div className={styles.page} data-movie-demo="true">
    <div className={styles.previewBar}>
      <div><button className={styles.previewBadge} aria-label="Toggle presenter controls" aria-expanded={presenter} onClick={() => setPresenter(!presenter)}>Interactive prototype</button><span className={styles.disclosure}>Scripted conversation · Simulated purchase</span></div>
    </div>
    {presenter && <section className={styles.presenter} aria-label="Presenter controls">
      <div className={styles.presenterTitle}><Film size={19}/><div><strong>After hours</strong><span>{scene ? `${state.scene + 1} / ${DEMO_SCENES.length} · ${scene.title}` : 'Ready for a fresh take'}</span></div></div>
      <div className={styles.presenterActions}>
        <button className={styles.primary} disabled={state.playing || complete || state.mode === 'Human'} onClick={() => dispatch({ type: 'start', auto: false })}><ChevronRight size={16}/>{state.scene < 0 ? 'Start scene' : state.cursor < (scene?.events.length || 0) ? 'Continue scene' : 'Next scene'}</button>
        {state.playing || state.auto ? <button onClick={() => dispatch({ type: 'pause' })}><Pause size={15}/>Pause playback</button> : <button disabled={complete || state.mode === 'Human'} onClick={() => dispatch({ type: 'start', auto: true })}><Play size={14}/>Play all</button>}
        <button onClick={reset}><RotateCcw size={14}/>Reset demo</button>
        <select aria-label="Demo playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={1}>Natural pace</option><option value={0.55}>Quick rehearsal</option></select>
        <button aria-label="Hide presenter controls" onClick={() => setPresenter(false)}><X size={16}/></button>
      </div>
      <p>{scene?.cue || 'Press N to start. Pauses after context and purchase updates give you time to speak.'}<span><kbd>N</kbd> Continue <kbd>Space</kbd> Pause <kbd>P</kbd> Hide controls</span></p>
    </section>}

    <div className={styles.workspace}>
      <aside className={styles.list} aria-label="Demo conversation list">
        <div className={styles.listHeader}><h1>Inbox</h1><Link href="/inbox?creator=briana&platform=onlyfans" aria-label="Exit presentation mode"><ArrowLeft size={16}/></Link></div>
        <div className={styles.creator}><img src={portraitUrl('studio')} alt="Bri"/><div><strong>Bri</strong><span>Creator workspace</span></div><ShieldCheck size={15}/></div>
        <div className={styles.platform}><PlatformMark platform="onlyfans" size={22}/><span>OnlyFans</span><span className={styles.channelLabel}>Demo channel</span></div>
        <div className={styles.conversationRow} aria-current="true"><img src={fanAvatarUrl('briana-ben')} alt=""/><div><strong>Ronan<span>{state.messages.length ? 'Now' : 'Ready'}</span></strong><p>{state.messages.at(-1)?.text || 'A late shift and a familiar conversation.'}</p><small><i/>{state.mode === 'Autonomous' ? 'Autonomous' : 'Human handling'}</small></div></div>
        <div className={styles.relationship}><span>RELATIONSHIP SNAPSHOT</span><strong>After the late shift</strong><p>Earlier work plans and last week’s purchase are in context.</p><button onClick={() => setSource('all')}><MessageCircle size={14}/>Earlier conversation<ArrowUpRight size={13}/></button></div>
        {presenter && <div className={styles.sessionProgress}><span>CONVERSATION PROGRESS</span>{DEMO_SCENES.map((item, index) => <div key={item.title} data-active={state.scene === index} data-complete={state.scene > index || state.scene === index && !state.playing && state.cursor === item.events.length}><b>{state.scene > index ? <Check size={11}/> : index + 1}</b><span>{item.title}</span></div>)}</div>}
        <footer><ShieldCheck size={13}/>Isolated demo session</footer>
      </aside>

      <main className={styles.chat} data-chat-platform="onlyfans" aria-label="After-hours conversation with Ronan">
        <header className={styles.chatHeader} data-chat-header><img src={fanAvatarUrl('briana-ben')} alt=""/><div><h2>Ronan <ShieldCheck size={15}/></h2><span>@ronan · OnlyFans</span></div><span className={styles.status}><i/>{state.mode}</span><Link className={styles.profileLink} href={demoProfileHref(state)} onClick={pauseForProfile} aria-label="View Ronan’s profile"><UserRound size={14}/><span>View profile</span></Link></header>
        <div className={styles.handling}><span><Bot size={15}/>{state.mode === 'Autonomous' ? 'Bri’s conversation style' : 'Automated replies paused'}</span>{state.mode === 'Autonomous' ? <button onClick={() => dispatch({ type: 'takeover' })}><UserRound size={13}/>Take over</button> : <button onClick={() => dispatch({ type: 'resume' })}><Bot size={13}/>Return to autonomous</button>}</div>
        <div ref={thread} className={styles.thread} aria-label="Demo message history" aria-live="polite" aria-relevant="additions text">
          <button className={styles.earlier} onClick={() => setSource('all')}><Clock3 size={12}/>View earlier conversation</button>
          <div className={styles.day}>Tonight</div>
          {!state.messages.length && <div className={styles.ready}><MessageCircle size={28}/><strong>Ready for his next message</strong><p>Earlier conversations and preferences are in context.</p></div>}
          {state.messages.map((message, index) => message.role === 'system' ? <div className={styles.purchaseEvent} key={message.id}><CheckCheck size={16}/><div><strong>{message.text}</strong><small>Simulated purchase · Fan record updated</small></div></div> : <div key={message.id} data-demo-message={message.id} className={`${styles.messageRow} ${message.role === 'creator' ? styles.outgoing : styles.incoming}`}>
            <div className={styles.bubble}>
              {message.offer && <div className={styles.offer} data-offer-status={state.purchased ? 'purchased' : 'pending'}>
                <div className={styles.offerImage}>{!photoFailed ? <img src={portraitUrl('portrait')} alt="Bri smiling in a casual vault portrait" className={state.purchased ? '' : styles.lockedPhoto} onError={() => setPhotoFailed(true)}/> : <div className={styles.photoFallback}><ImageIcon size={25}/><span>Photo preview unavailable</span></div>}{!state.purchased && <span><LockKeyhole size={21}/>Private photo</span>}</div>
                <div className={styles.offerInfo}><div><strong>Private photo</strong><span>1 photo · {dollars(DEMO_PRICE)}</span></div><span className={state.purchased ? styles.purchased : styles.pending}>{state.purchased ? <><Check size={13}/>Purchased</> : <><LockKeyhole size={12}/>Awaiting purchase</>}</span></div>
              </div>}
              <p>{message.text}</p><div className={styles.messageMeta}>{message.manual && <span>Operator</span>}<time>{`11:${String(42 + Math.floor(index / 4)).padStart(2, '0')} pm`}</time>{message.role === 'creator' && <CheckCheck size={13}/>}</div>
            </div>
          </div>)}
          {typing && <div className={styles.typing} role="status"><span/><span/><span/><small>Bri is typing</small></div>}
          {complete && presenter && <div className={styles.completed}><CheckCheck size={14}/>Conversation complete. Ready for another take.</div>}
        </div>
        <div className={styles.responseStatus}><Sparkles size={15}/><span>{state.mode === 'Human' ? 'You are in control. Demo replies are paused.' : recalling ? 'Retrieving relevant details from earlier conversations' : typing ? 'Preparing the next reply using conversation context' : state.purchased ? 'Purchase remembered. Conversation continues naturally.' : state.messages.length ? 'Conversation history and creator style are in context' : 'Ready with 2 context records and 4 previous purchases'}</span></div>
        <form className={styles.composer} data-chat-composer onSubmit={event => { event.preventDefault(); dispatch({ type: 'manual', text: draft }); setDraft(''); }}><textarea aria-label="Demo reply to Ronan" value={draft} disabled={state.mode === 'Autonomous'} onChange={event => setDraft(event.target.value)} maxLength={2000} placeholder={state.mode === 'Autonomous' ? 'Autonomous handling is on. Take over to write a reply.' : 'Write a reply to Ronan…'}/><button type="submit" className={styles.primary} disabled={state.mode === 'Autonomous' || !draft.trim()}><Send size={15}/>Send</button></form>
      </main>

      <aside className={styles.context} aria-label="Demo fan context">
        <header><span className={styles.contextIcon} data-conversation-core><IntelligenceCoreIcon size={40}/></span><div><h2>Conversation intelligence</h2><span>History, relevance and continuity</span></div></header>
        <div className={styles.stats}><div><span>Relationship spend</span><strong data-demo-spend>{dollars(totals.spent)}</strong></div><div><span>Purchases</span><strong data-demo-purchases>{totals.purchases}</strong></div></div>
        <nav className={styles.tabs} aria-label="Demo context sections">{(['Context','Fan record'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value}</button>)}</nav>
        <div className={styles.contextBody}>
          {tab === 'Context' ? <>
            <div className={styles.contextStatus}><i className={state.playing ? styles.pulse : ''}/><span>{recalling ? 'Retrieving relevant conversation context…' : state.context}</span></div>
            <h3>Context used</h3>
            {DEMO_MEMORIES.filter(memory => !scene || scene.memories.includes(memory.id)).map(memory => <div className={styles.memory} key={memory.id}><div><MessageCircle size={13}/><strong>{memory.label}</strong><span>Remembered</span></div><p>{memory.value}</p><button onClick={() => setSource(memory.source)}>View source record<ArrowUpRight size={11}/></button></div>)}
            <div className={styles.creatorStyle}><span><Bot size={14}/>Creator style</span><p>Playful, warm, short replies. Light teasing. Let him set the pace.</p></div>
            {state.scene >= 3 && <div className={styles.contentMatch}><h3>Relevant content</h3><div><img src={portraitUrl('portrait')} alt="Selected casual vault portrait"/><span><strong>Private photo</strong><small>Demo photo · {dollars(DEMO_PRICE)}</small></span></div><p><Check size={13}/>Matches his request for a photo</p><p><Check size={13}/>Existing preview, awaiting the supplied photo</p><p><Check size={13}/>{state.purchased ? 'Added to his owned content' : 'Not in his 4 previous purchases'}</p></div>}
            {state.memorySaved && <div className={styles.newMemory}><CheckCheck size={16}/><div><strong>New context saved</strong><p>Ronan covered for James and came home tired. Photo unlocked. Follow up after he has rested.</p></div></div>}
          </> : <>
            <h3>Owned content</h3>
            {[...DEMO_OWNED, ...(state.purchased ? [{id:'new-photo',title:'Private photo',amount:DEMO_PRICE}] : [])].map(item => <div className={styles.ownedItem} key={item.id}><span><ImageIcon size={15}/></span><div><strong>{item.title}</strong><small>{item.id === 'new-photo' ? 'Just purchased · Demo' : 'Earlier purchase · Demo'}</small></div><b>{dollars(item.amount)}</b></div>)}
            <h3>Session activity</h3>
            {!state.activity.length && <p className={styles.muted}>Actions appear here as the conversation unfolds.</p>}
            {state.activity.slice().reverse().map((text,index) => <div className={styles.activity} key={`${index}-${text}`}><Check size={13}/><p>{text}</p></div>)}
          </>}
        </div>
        <footer><ShieldCheck size={13}/><span>Demo records. No external messages or payments.</span></footer>
      </aside>
    </div>

    <dialog ref={sourceDialog} className={styles.sourceDialog} aria-label="Earlier conversation with Ronan" onCancel={() => setSource(null)} onClick={event => { if(event.target === sourceDialog.current) setSource(null); }}><header><div><span>ONLYFANS · EARLIER CONVERSATION</span><h2>Where the context came from</h2></div><button aria-label="Close earlier conversation" onClick={() => setSource(null)}><X size={20}/></button></header><p className={styles.sourceIntro}>Prepared records for this scripted demonstration. These are summaries, not quoted messages.</p>{DEMO_HISTORY.map(message => <div key={message.id} className={styles.sourceMessage} data-highlighted={source === message.id}><strong>{message.role === 'system' ? 'Prepared demo record' : message.role === 'fan' ? 'Ronan' : 'Bri'}</strong><p>{message.text}</p>{source === message.id && <small><Check size={12}/>Used in this reply</small>}</div>)}</dialog>
  </div>;
}
