import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import { flirtCreatorCopy } from "@/lib/flirt-creator-locale";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./CreatorStudio.module.css";

export default async function CreatorStudioHelp({ brandName }: { brandName: string }) {
  const locale = await getFlirtCreatorLocale();
  const t = flirtCreatorCopy(locale);
  return <div><div className={styles.heading}><div><p className={styles.eyebrow}>{t("HELP & SUPPORT", "AJUDA E SUPORTE")}</p><h1>{t("A little guidance, anytime.", "Encontre ajuda sempre que precisar.")}</h1><p>{t("Make yourself at home in your creator studio.", "Saiba como usar seu estúdio.")}</p></div></div>
    <div className={styles.faq}>{[
      [t("What happens after I submit?", "O que acontece depois que envio meu cadastro?"), t("Your home screen follows your application’s actual progress, from submitted to review and approval. When your AI profile is connected, your performance overview appears automatically.", "A tela inicial mostra o andamento do cadastro, do envio até a análise e a aprovação. Quando seu perfil de IA for conectado, o resumo de desempenho aparecerá automaticamente.")],
      [t("Where can I see my content?", "Onde posso ver meu conteúdo?"), t("Choose My Content in the navigation to open your saved uploads or connected content library. Your content remains attached to your own creator account.", "No menu, selecione Meu conteúdo para acessar seus arquivos salvos ou sua biblioteca conectada. Seu conteúdo fica vinculado à sua conta de criadora.")],
      [t("How does performance update?", "Como o desempenho é atualizado?"), t("The overview reads the same recorded payments and activity as your earnings page. It refreshes every minute while the page is visible. Choose 7, 30 or 90 days to change the reporting period. New activity can take a little time to appear.", "O resumo usa os mesmos pagamentos e atividades da página de ganhos. Os dados são atualizados a cada minuto enquanto a página está aberta e visível. Escolha 7, 30 ou 90 dias para mudar o período. Atividades recentes podem levar um pouco de tempo para aparecer.")],
      [t("What do the numbers mean?", "O que os números significam?"), t("Your earnings shows your share of recorded earnings for the selected period. Active fans counts people who sent a message. Conversations counts chats with activity during that period. Earnings are not a payout balance.", "Seus ganhos mostram sua parte dos ganhos registrados no período selecionado. Fãs ativos são as pessoas que enviaram uma mensagem. Conversas são os chats com atividade nesse período. Os ganhos são diferentes do saldo disponível para repasse.")],
      [t("Can I update my personality?", "Posso atualizar a personalidade da minha IA?"), t("Choose My AI to review your saved answers or connected profile. Editing is available where your account allows it; preview accounts stay read-only.", "Selecione Minha IA para revisar suas respostas salvas ou seu perfil conectado. A edição depende das permissões da sua conta. Contas de demonstração permitem apenas a visualização.")],
      [t("Need a hand from the team?", "Precisa falar com a equipe?"), t(`Contact your ${brandName} team through your usual onboarding contact. Include what you were trying to do and any message shown on screen so they can help.`, `Fale com a equipe da ${brandName} pelo mesmo canal usado durante o cadastro. Informe o que você tentou fazer e inclua qualquer mensagem que apareceu na tela.`)],
    ].map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    <section className={styles.profileStrip}><div><h2>{t("Your account, at a glance.", "Sua conta em um só lugar.")}</h2><p>{t("Check your profile and onboarding status.", "Confira seu perfil e o status do cadastro.")}</p></div><Link className={styles.secondaryButton} href="/creator/info">{t("Account information", "Dados da conta")} <ArrowRight size={16} /></Link></section>
  </div>;
}
