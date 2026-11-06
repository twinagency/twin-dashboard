import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import { flirtCreatorCopy } from "@/lib/flirt-creator-locale";
import { creatorApplicationState, creatorApplicationStateLabel } from "@/lib/creator-application-state";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { cloneBotToken } from "@/lib/clone-credentials";
import { getStarBalance } from "@/lib/star-balance";
import StarAmount from "@/components/StarAmount";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function CreatorInfoPage() {
  const creator = await requireCreatorWorkspace();
  const locale = await getFlirtCreatorLocale();
  const t = flirtCreatorCopy(locale);
  const application = creator.applicationState || creatorApplicationState(null);
  const id = creator.cloneIds[0];
  const details = id ? await withDashboardAccess(creator, async () => {
    const clone = await supabaseAdmin.from("clones").select("id,name,slug,status").eq("id", id).maybeSingle();
    if (clone.error || !clone.data) throw new Error("Your creator information could not be loaded");
    const token = await cloneBotToken(id);
    const balance = token ? await getStarBalance(id, token).catch(() => null) : null;
    return { clone: clone.data, balance };
  }) : null;
  return <div className="dashboard-page mx-auto grid max-w-3xl gap-5 text-ink"><div><h1 className="text-2xl font-semibold">{t("Info", "Dados da conta")}</h1><p className="mt-1 text-sm text-muted">{t("Your connected AI profile and account information.", "Dados da sua conta e do seu perfil de IA.")}</p></div><Card className="divide-y divide-line overflow-hidden p-0">{[
    [t("Creator", "Criadora"), creator.creatorName], [t("Agency", "Agência"), creator.name], [t("Profile", "Perfil"), details?.clone.slug || t("Awaiting connection", "Aguardando conexão")], [t("AI profile status", "Status da IA"), details?.clone.status ? t(details.clone.status, ({ active: "Ativo", paused: "Pausado", inactive: "Inativo" } as Record<string, string>)[details.clone.status] ?? details.clone.status) : t("Not connected", "Sem conexão")], [t("Onboarding", "Cadastro"), creatorApplicationStateLabel(application.label, locale)],
  ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 p-4 text-sm"><span className="text-muted">{label}</span><span className="creator-name text-right font-medium">{value}</span></div>)}</Card><div className="grid gap-4 sm:grid-cols-2"><Card className="p-5"><h2 className="mb-3 text-sm text-muted">{t("Lifetime proceeds", "Receita acumulada")}</h2><div className="text-2xl font-semibold text-good">{details?.balance ? <StarAmount stars={details.balance.lifetimeStars} /> : t("Unavailable", "Indisponível")}</div><p className="mt-2 text-xs text-muted">{t("Gross sales received by your AI profile, not a payout balance.", "Vendas brutas recebidas pelo seu perfil de IA. O saldo de repasses é exibido separadamente.")}</p></Card><Card className="p-5"><h2 className="mb-3 text-sm text-muted">{t("Telegram Stars balance", "Saldo de Estrelas do Telegram")}</h2><div className="text-2xl font-semibold text-good">{details?.balance?.totalBalanceStars != null ? <StarAmount stars={details.balance.totalBalanceStars} /> : t("Unavailable", "Indisponível")}</div><p className="mt-2 text-xs text-muted">{t("The current bot wallet balance, when Telegram makes it available.", "Saldo atual da carteira do bot, quando disponibilizado pelo Telegram.")}</p></Card></div></div>;
}
