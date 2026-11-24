"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

const endpoint = "/creator-auth/telegram/feed";
const pollInterval = 8_000;
type Conversation = { id: string; name: string; preview: string; updatedAt: string | null };
type Message = { id: string; direction: "in" | "out"; text: string; mediaType?: string | null; createdAt: string | null };

function uniqueRows<T extends { id: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

// Each mounted list has one request in flight. Poll the first page while keeping
// the older pages the viewer has opened. Both lists are stored newest first.
function useLivePages<T extends { id: string }>(url: string, field: "conversations" | "messages") {
  const [rows, setRows] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [denied, setDenied] = useState(false);
  const [paging, setPaging] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const hasOlder = useRef(false);
  const load = useCallback(async (olderCursor?: string) => {
    if (inFlight.current && !olderCursor) return;
    if (olderCursor) inFlight.current?.abort();
    const request = new AbortController();
    inFlight.current = request;
    if (olderCursor) setPaging(true);
    const timeout = window.setTimeout(() => request.abort(), 18_000);
    try {
      const requestUrl = new URL(url, window.location.origin);
      if (olderCursor) requestUrl.searchParams.set("cursor", olderCursor);
      const response = await fetch(requestUrl, { cache: "no-store", signal: request.signal });
      if (inFlight.current !== request) return;
      if (response.status === 401 || response.status === 403 || response.redirected) {
        setDenied(true);
        hasOlder.current = false;
        setRows([]);
        setCursor(null);
        return;
      }
      if (!response.ok) throw new Error("Unavailable");
      const page = await response.json();
      if (!Array.isArray(page[field])) throw new Error("Unexpected feed response");
      if (inFlight.current !== request) return;
      const items: T[] = field === "messages" ? [...page[field]].reverse() : page[field];
      if (olderCursor) hasOlder.current = true;
      const keepHistory = hasOlder.current;
      setRows(previous => {
        if (!keepHistory) return items;
        return uniqueRows(olderCursor ? [...(previous || []), ...items] : [...items, ...(previous || [])]);
      });
      if (olderCursor || !keepHistory) setCursor(page.nextCursor || null);
      setDenied(false);
      setError(false);
    } catch {
      if (inFlight.current === request) setError(true);
    } finally {
      window.clearTimeout(timeout);
      if (inFlight.current === request) {
        inFlight.current = null;
        setPaging(false);
      }
    }
  }, [field, url]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    refresh();
    const timer = window.setInterval(refresh, pollInterval);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [load]);

  return { rows, cursor, error, denied, paging, load };
}

function displayTime(value: string | null, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const muted = "text-[var(--studio-muted)]";
const moreButton = "w-full rounded-lg py-2 text-sm font-semibold text-[var(--studio-accent-deep)] hover:bg-[var(--studio-tint)] disabled:opacity-60";

function Transcript({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { t, locale } = useFlirtCreatorLocale();
  const feed = useLivePages<Message>(endpoint + "?fan=" + encodeURIComponent(conversation.id), "messages");
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const newest = feed.rows?.[0]?.id;
  useLayoutEffect(() => {
    if (atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [newest]);
  const mediaLabels: Record<string, string> = {
    photo: t("Photo", "Foto"), image: t("Photo", "Foto"), video: t("Video", "Vídeo"),
    audio: t("Audio", "Áudio"), voice: t("Voice message", "Mensagem de voz"),
    sticker: t("Sticker", "Figurinha"), animation: "GIF", document: t("File", "Arquivo"),
    paid_media: t("Paid media", "Mídia paga"),
  };
  return <section aria-label={t("Telegram conversation", "Conversa no Telegram")} className="flex h-full min-h-0 min-w-0 flex-col">
    <header className="flex min-h-16 items-center gap-3 border-b border-[var(--studio-line)] px-4">
      <button type="button" onClick={onBack} aria-label={t("Back to chats", "Voltar às conversas")} className="rounded-lg p-2 hover:bg-[var(--studio-tint)] md:hidden"><ArrowLeft size={20} /></button>
      <h2 className="truncate font-semibold">{conversation.name}</h2>
    </header>
    {feed.error && !feed.denied && <div role="status" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">{t("Messages couldn’t refresh. Reconnecting…", "Não foi possível atualizar as mensagens. Reconectando…")}</div>}
    <div ref={scroll} onScroll={event => {
      const box = event.currentTarget;
      atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 72;
    }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--studio-bg)] p-4">
      {feed.denied ? <p role="status" className={muted}>{t("This chat is unavailable.", "Esta conversa está indisponível.")}</p> : <>
        {feed.cursor && <button type="button" className={moreButton} disabled={feed.paging} onClick={() => void feed.load(feed.cursor!)}>{feed.paging ? t("Loading…", "Carregando…") : t("Load earlier messages", "Carregar mensagens anteriores")}</button>}
        {!feed.rows && !feed.error && <p role="status" className={muted}>{t("Loading messages…", "Carregando mensagens…")}</p>}
        {feed.rows?.length === 0 && <p className={muted}>{t("No messages in this chat yet.", "Ainda não há mensagens nesta conversa.")}</p>}
        <ol className="grid gap-3">{feed.rows?.slice().reverse().map(message => {
          const outgoing = message.direction === "out";
          const media = message.mediaType && mediaLabels[message.mediaType.toLowerCase()];
          return <li key={message.id} className={outgoing ? "max-w-[88%] justify-self-end" : "max-w-[88%] justify-self-start"}>
            <div className={outgoing ? "rounded-2xl rounded-br-sm bg-[var(--studio-dark)] px-3.5 py-2 text-white" : "rounded-2xl rounded-bl-sm border border-[var(--studio-line)] bg-white px-3.5 py-2"}>
              {message.mediaType && <span className="block text-xs font-semibold">{media || t("Attachment", "Anexo")}</span>}
              {message.text && <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{message.text}</p>}
              {!message.mediaType && !message.text && <span className="text-sm italic">{t("Message", "Mensagem")}</span>}
            </div>
            <div className={`mt-1 text-[11px] ${muted} ${outgoing ? "text-right" : ""}`}>
              {outgoing ? t("Your profile", "Seu perfil") : conversation.name}
              {message.createdAt && <> · <time dateTime={message.createdAt}>{displayTime(message.createdAt, locale)}</time></>}
            </div>
          </li>;
        })}</ol>
      </>}
    </div>
  </section>;
}

export default function CreatorTelegramFeed() {
  const { t, locale } = useFlirtCreatorLocale();
  const feed = useLivePages<Conversation>(endpoint, "conversations");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const current = feed.rows?.find(row => row.id === selected?.id) || selected;
  const heading = t("Live Telegram chats", "Conversas ao vivo no Telegram");
  return <section aria-label={heading} className="min-w-0 text-[var(--studio-ink)]">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">{heading}</h1>
      {feed.rows && !feed.error && !feed.denied && <span className="flex items-center gap-2 text-sm text-emerald-800"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-600" />{t("Live", "Ao vivo")}</span>}
    </div>
    {feed.denied ? <p role="status" className={muted}>{t("This feed is unavailable for your current session.", "Este feed está indisponível para sua sessão atual.")}</p> :
      <div className="grid h-[min(68dvh,700px)] min-h-80 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-[var(--studio-line)] bg-white md:grid-cols-[minmax(210px,34%)_1fr]">
        <aside className={`min-h-0 min-w-0 flex-col border-[var(--studio-line)] md:flex md:border-r ${selected ? "hidden" : "flex"}`}>
          <header className="flex min-h-16 items-center border-b border-[var(--studio-line)] px-4"><h2 className="font-semibold">{t("Conversations", "Conversas")}</h2></header>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {feed.error && <p role="status" className="bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("Chats couldn’t refresh. Reconnecting…", "Não foi possível atualizar as conversas. Reconectando…")}</p>}
            {!feed.rows && !feed.error && <p role="status" className={`p-4 text-sm ${muted}`}>{t("Loading chats…", "Carregando conversas…")}</p>}
            {feed.rows?.length === 0 && <p className={`p-4 text-sm ${muted}`}>{t("No Telegram conversations yet.", "Ainda não há conversas no Telegram.")}</p>}
            <ul className="divide-y divide-[var(--studio-line)]">{feed.rows?.map(row => <li key={row.id}>
              <button type="button" aria-pressed={current?.id === row.id} onClick={() => setSelected(row)} className="grid w-full min-w-0 gap-1 px-4 py-3 text-left hover:bg-[var(--studio-bg)] aria-pressed:bg-[var(--studio-tint)]">
                <span className="truncate text-sm font-semibold">{row.name}</span>
                {row.preview && <span className={`truncate text-sm ${muted}`}>{row.preview}</span>}
                {row.updatedAt && <time className={`text-[11px] ${muted}`} dateTime={row.updatedAt}>{displayTime(row.updatedAt, locale)}</time>}
              </button>
            </li>)}</ul>
            {feed.cursor && <button type="button" disabled={feed.paging} className={moreButton} onClick={() => void feed.load(feed.cursor!)}>{feed.paging ? t("Loading…", "Carregando…") : t("Load more chats", "Carregar mais conversas")}</button>}
          </div>
        </aside>
        {current ? <Transcript key={current.id} conversation={current} onBack={() => setSelected(null)} /> :
          <div className={`hidden place-content-center justify-items-center gap-3 px-4 text-center text-sm md:grid ${muted}`}>
            <MessageCircle size={26} aria-hidden="true" />
            {t("Select a chat to read the conversation.", "Selecione uma conversa para ler as mensagens.")}
          </div>}
      </div>}
  </section>;
}
