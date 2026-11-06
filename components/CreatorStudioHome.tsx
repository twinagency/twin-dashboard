"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Check, CheckCircle2, CircleHelp, Clock3, Images, MessageCircle, RefreshCw, Sparkles, Users, Wallet } from "lucide-react";
import { useCreatorCurrency } from "./useCreatorCurrency";
import FlirtCreatorFxNote from "./FlirtCreatorFxNote";
import { StudioAvatar } from "./CreatorStudioShell";
import { fmtDisplayMoney, fmtNum, STAR_USD } from "@/lib/money";
import { creatorStudioStatusLabel, readStudioPerformance, STUDIO_PERIODS, type CreatorStudioBrand, type CreatorStudioStatus, type StudioPerformance, type StudioPeriod } from "@/lib/creator-studio-model";
import styles from "./CreatorStudio.module.css";

export default function CreatorStudioHome({ brand, name, cloneId, photoUrl, status, contentHref, readOnly = false }: {
  brand: CreatorStudioBrand; name: string; cloneId: string | null; photoUrl?: string; status: CreatorStudioStatus; contentHref: string; readOnly?: boolean;
}) {
  const { t, locale } = useFlirtCreatorLocale();
  const firstName = name.trim().split(/\s+/)[0] || t("creator", "criadora");
  const draft = status.phase === "draft";
  const needsHelp = status.phase === "changes" || status.phase === "withdrawn";
  const myAiHref = cloneId ? "/creator/edit" : "/creator/onboarding?step=questionnaire";
  return <div data-creator-studio-home data-setup-phase={status.phase}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>{t("YOUR CREATOR STUDIO", "SEU ESTÚDIO")}</p><h1>{cloneId ? t(`Looking good, ${firstName}.`, `Olá, ${firstName}!`) : t(`Your studio, ${firstName}.`, `Bem-vinda ao seu estúdio, ${firstName}!`)}</h1><p>{cloneId ? t("Your earnings, your content, your next chapter.", "Seus ganhos, seu conteúdo e a próxima etapa da sua jornada.") : t("Everything you need for what comes next.", "Tudo o que você precisa para começar.")}</p></div></div>
    {cloneId ? <>
      <section className={styles.profileStrip}><StudioAvatar name={name} photoUrl={photoUrl} /><div><h2>{status.phase === "paused" ? t("Your AI is paused.", "Sua IA está pausada.") : status.phase === "ready" ? t("Your AI profile is ready.", "Seu perfil de IA está pronto.") : t("Your AI profile is connected.", "Seu perfil de IA está conectado.")}</h2><p>{status.phase === "paused" ? t("Your past performance is still available below.", "Você ainda pode consultar seu desempenho abaixo.") : t("Your personality, always part of the conversation.", "Sua personalidade está presente em cada conversa.")}</p></div><Link className={styles.secondaryButton} href={myAiHref}>{readOnly ? t("My AI details", "Detalhes da minha IA") : t("View my AI", "Ver minha IA")}<ArrowRight size={16} /></Link></section>
      <StudioPerformanceOverview cloneId={cloneId} />
    </> : <div className={styles.homeGrid}>
      <section className={styles.welcome} data-creator-clone-building={!draft && !needsHelp ? "true" : undefined}>
        <div className={styles.decoration} aria-hidden="true" />
        <span className={styles.miniLabel}>{draft ? <Sparkles size={16} /> : <CheckCircle2 size={16} />}{creatorStudioStatusLabel(status, locale)}</span>
        <h2>{draft ? <>{t("Let’s make this", "Vamos deixar tudo")}<br />{t("feel like", "com a sua")} <em>{t("you.", "cara.")}</em></> : needsHelp ? <>{t("Let’s take the", "Vamos dar o")}<br /><em>{t("next step.", "próximo passo.")}</em></> : <>{t("You’re in.", "Cadastro enviado.")}<br />{t("Let’s make it", "Seu espaço é")} <em>{t("yours.", "seu.")}</em></>}</h2>
        <p>{draft ? t("Bring your content and personality together. Complete your setup whenever you’re ready.", "Reúna seu conteúdo e mostre sua personalidade. Conclua a configuração quando quiser.") : status.phase === "reviewing" ? t("Your details are being reviewed. You can keep adding content while your creator profile takes shape.", "Seus dados estão em análise. Você pode continuar enviando conteúdo enquanto preparamos seu perfil.") : status.phase === "approved" ? t("Your onboarding is approved. Your performance overview will appear here when your AI profile is connected.", "Seu cadastro foi aprovado. Você verá seu desempenho aqui assim que seu perfil de IA for conectado.") : needsHelp ? t("Check your onboarding status and contact your agency team for the next steps.", "Confira o status do seu cadastro e fale com a equipe da sua agência sobre os próximos passos.") : t(`Thanks for joining ${brand === "moxy" ? "Moxy" : "Flirt"}. Your onboarding has been received. Your next chapter starts here.`, `Boas-vindas à ${brand === "moxy" ? "Moxy" : "Flirt"}! Recebemos seu cadastro.`)}</p>
        <Link className={styles.primaryButton} href={draft ? "/creator/onboarding" : needsHelp ? "/creator/help" : contentHref} data-return-to-onboarding={draft ? "true" : undefined} data-finish-onboarding={draft ? "true" : undefined}>{draft ? t("Continue setup", "Continuar configuração") : needsHelp ? t("Help & support", "Ajuda e suporte") : t("Explore your content", "Ver meu conteúdo")}<ArrowRight size={16} /></Link>
      </section>
      <section className={styles.timelineCard}><h2>{draft ? t("Two steps. All you.", "Dois passos para deixar tudo com a sua cara.") : t("Your next chapter", "Próximas etapas")}</h2>
        {needsHelp ? <div className={styles.notice}><h3>{creatorStudioStatusLabel(status, locale)}</h3><p>{t("Open your account information to see the current application status.", "Abra os dados da sua conta para consultar o status do cadastro.")}</p><Link href="/creator/info">{t("View account information", "Ver dados da conta")} <ArrowRight size={15} /></Link></div> : <ol className={styles.timeline}>
          {(draft ? [
            { title: t("Your content", "Seu conteúdo"), copy: t("Add photos, videos or a folder link.", "Envie fotos, vídeos ou um link para uma pasta."), done: false, current: true },
            { title: t("Your personality", "Sua personalidade"), copy: t("Tell us what makes you, you.", "Conte um pouco sobre o que faz de você quem você é."), done: false, current: false },
          ] : [
            { title: t("Onboarding received", "Cadastro recebido"), copy: t("Your information is with us.", "Recebemos suas informações."), done: true, current: false },
            { title: status.phase === "approved" ? t("Profile approved", "Perfil aprovado") : status.phase === "reviewing" ? t("Under review", "Em análise") : t("Review comes next", "Próxima etapa: análise"), copy: status.phase === "approved" ? t("Your details have been approved.", "Seus dados foram aprovados.") : status.phase === "reviewing" ? t("Your team is reviewing your details.", "Sua equipe está analisando seus dados.") : t("Your submission is ready for your team.", "Seus dados estão disponíveis para a equipe."), done: status.phase === "approved", current: status.phase === "reviewing" },
            { title: t("Your AI is ready", "Sua IA está pronta"), copy: t("Your performance overview opens here.", "Você poderá acompanhar seu desempenho aqui."), done: false, current: status.phase === "approved" },
          ]).map((step, index) => <li key={step.title} data-current={step.current} data-done={step.done}><span className={styles.stepCircle}>{step.done ? <Check size={14} /> : step.current ? <Clock3 size={14} /> : index + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></li>)}
        </ol>}
        <p className={styles.timelineFooter}>{draft ? t("Come back and finish at any time.", "Você pode voltar e terminar a qualquer momento.") : t("Your status updates automatically here.", "O status é atualizado aqui automaticamente.")}</p>
      </section>
    </div>}
    <div className={styles.sectionHeading}><h2>{cloneId ? t("Keep the momentum.", "Continue acompanhando.") : t("Make yourself at home.", "Explore seu estúdio.")}</h2><p>{t("Your next little update.", "Veja o que você pode fazer agora.")}</p></div>
    <div className={styles.actionGrid}>
      <ActionCard icon="content" title={t("Your content", "Seu conteúdo")} copy={t("Your photos and videos, together in one place.", "Suas fotos e seus vídeos em um só lugar.")} link={t("Open my content", "Abrir meu conteúdo")} href={contentHref} />
      <ActionCard icon="ai" title={t("Your personality", "Sua personalidade")} copy={readOnly ? t("See the details of your connected AI profile.", "Veja os detalhes do seu perfil de IA conectado.") : t("Your interests, your style, your boundaries.", "Seus interesses, seu estilo e seus limites.")} link={readOnly ? t("View my profile", "Ver meu perfil") : t("Review my profile", "Revisar meu perfil")} href={myAiHref} />
      <ActionCard icon={cloneId ? "earnings" : "help"} title={cloneId ? t("See your progress", "Acompanhe seus resultados") : t("We’re here for you", "Estamos aqui para ajudar")} copy={cloneId ? t("Take a closer look at your creator earnings.", "Veja os detalhes dos seus ganhos.") : t("A little guidance, whenever you need it.", "Encontre orientação sempre que precisar.")} link={cloneId ? t("View earnings", "Ver ganhos") : t("Help & support", "Ajuda e suporte")} href={cloneId ? "/creator/earnings" : "/creator/help"} />
    </div>
    {!cloneId && <section className={styles.profileStrip}><StudioAvatar name={name} photoUrl={photoUrl} /><div><h2>{name}</h2><p>{t("Your creator account", "Sua conta de criadora")}</p></div><Link className={styles.textLink} href="/creator/info">{t("Account details", "Dados da conta")} <ArrowRight size={15} /></Link></section>}
  </div>;
}

function ActionCard({ icon, title, copy, link, href }: { icon: string; title: string; copy: string; link: string; href: string }) {
  const Icon = icon === "content" ? Images : icon === "ai" ? Sparkles : icon === "earnings" ? Wallet : CircleHelp;
  return <Link className={styles.actionCard} href={href} data-creator-content-access={icon === "content" ? "true" : undefined} data-creator-onboarding-access={icon === "ai" ? "true" : undefined}><span className={styles.iconTile}><Icon size={20} /></span><h3>{title}</h3><p>{copy}</p><span className={styles.cardFooter}>{link}<ArrowRight size={16} /></span></Link>;
}

export function StudioPerformanceOverview({ cloneId }: { cloneId: string }) {
  const [period, setPeriod] = useState<StudioPeriod>("1M");
  const [data, setData] = useState<StudioPerformance | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const { t, locale } = useFlirtCreatorLocale();
  const { currency, rate } = useCreatorCurrency();
  const periodLabel = (item: (typeof STUDIO_PERIODS)[number]) => t(item.label, item.label.replace(" days", " dias"));
  const gradientId = `studio-earnings-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    setData(null); setError(false); setLoading(true);
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const params = new URLSearchParams({ period, clone: cloneId });
        const response = await fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Performance is unavailable.");
        const next = readStudioPerformance(await response.json(), cloneId, period);
        if (!controller.signal.aborted) { setData(next); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [cloneId, period, retry]);
  const amount = (stars: number) => stars * STAR_USD * rate;
  const chart = data?.series.map(row => ({ bucket: row.bucket, earnings: amount(row.stars) })) || [];
  const metricValue = (value: number | undefined, money = false) => value == null ? loading ? "…" : t("Unavailable", "Indisponível") : money ? fmtDisplayMoney(amount(value), currency, locale) : fmtNum(value, locale);
  return <section className={styles.performance} aria-label={t("Performance overview", "Resumo de desempenho")} aria-busy={loading}>
    <div className={styles.sectionHeading}><h2>{t("Performance overview", "Resumo de desempenho")}</h2><div className={styles.periods} role="group" aria-label={t("Reporting period", "Período do relatório")}>{STUDIO_PERIODS.map(item => <button key={item.key} aria-pressed={period === item.key} onClick={() => setPeriod(item.key)}>{periodLabel(item)}</button>)}</div></div>
    {error && <div className={styles.error} role="alert"><span>{data ? t("The latest update could not be loaded. Showing the last successful update.", "Não foi possível buscar novos dados. Você está vendo a última atualização disponível.") : t("We couldn’t load your performance. Please try again.", "Não foi possível carregar seu desempenho. Tente novamente.")}</span><button onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} />{t("Try again", "Tentar novamente")}</button></div>}
    <div className={styles.statsGrid}>
      {[
        { title: t("Your earnings", "Seus ganhos"), value: metricValue(data?.stars, true), note: t("Your share for this period", "Sua parte dos ganhos no período"), icon: Wallet },
        { title: t("Active fans", "Fãs ativos"), value: metricValue(data?.activeFans), note: t("Fans who sent a message", "Fãs que enviaram mensagem"), icon: Users },
        { title: t("Conversations", "Conversas"), value: metricValue(data?.conversations), note: t("Chats active in this period", "Conversas ativas no período"), icon: MessageCircle },
      ].map(({ title, value, note, icon: Icon }) => <article key={title} className={styles.statCard}><div>{title}<Icon size={19} /></div><strong>{value}</strong><p>{note}</p></article>)}
    </div>
    <section className={styles.chartPanel}>
      <div className={styles.sectionHeading}><div><h2>{t("A little progress, every day.", "Sua evolução ao longo do tempo")}</h2><p>{t("Your earnings", "Seus ganhos")} · {currency} · {periodLabel(STUDIO_PERIODS.find(item => item.key === period) ?? STUDIO_PERIODS[1])}</p></div><span className={styles.chartKey}>{t("Your earnings", "Seus ganhos")}</span></div>
      {data && chart.length ? <div className={styles.chart} role="img" aria-label={`Your earnings over ${periodLabel(STUDIO_PERIODS.find(item => item.key === period) ?? STUDIO_PERIODS[1])}: ${fmtDisplayMoney(amount(data.stars), currency, locale)}.`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 12, right: 15, bottom: 0, left: 0 }}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--studio-accent)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--studio-accent)" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--studio-line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="bucket" axisLine={false} tickLine={false} minTickGap={60} tick={{ fontSize: 11, fill: "var(--studio-muted)" }} /><YAxis axisLine={false} tickLine={false} width={58} tick={{ fontSize: 11, fill: "var(--studio-muted)" }} tickFormatter={value => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 }).format(Number(value))} /><Tooltip formatter={(value: number) => [fmtDisplayMoney(value, currency, locale), t("Your earnings", "Seus ganhos")]} contentStyle={{ borderRadius: 12, border: "1px solid var(--studio-line)", fontSize: 12 }} /><Area type="linear" dataKey="earnings" stroke="var(--studio-accent)" strokeWidth={2.5} fill={`url(#${gradientId})`} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <div className={styles.chartEmpty}>{loading ? t("Loading your earnings…", "Carregando seus ganhos…") : error ? t("Your earnings chart will return when the data is available.", "O gráfico de ganhos aparecerá quando houver dados disponíveis.") : t("No earnings recorded in this period yet.", "Ainda não há ganhos registrados neste período.")}</div>}
      <div className={styles.chartFooter}><span>{loading ? t("Loading your data…", "Carregando seus dados…") : data?.stale ? t("Refreshing the latest data…", "Atualizando os dados…") : data ? t("Updates automatically every minute", "Atualização automática a cada minuto") : t("Your own creator activity appears here", "Sua atividade aparece aqui")}</span><Link href="/creator/earnings">{t("View full earnings", "Ver todos os ganhos")} <ArrowRight size={14} /></Link></div>
    </section>
    <FlirtCreatorFxNote />
  </section>;
}
