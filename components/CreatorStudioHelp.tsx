import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./CreatorStudio.module.css";

export default function CreatorStudioHelp({ brandName }: { brandName: string }) {
  return <div><div className={styles.heading}><div><p className={styles.eyebrow}>HELP & SUPPORT</p><h1>A little guidance, anytime.</h1><p>Make yourself at home in your creator studio.</p></div></div>
    <div className={styles.faq}>{[
      ["What happens after I submit?", "Your home screen follows your application’s actual progress, from submitted to review and approval. When your AI profile is connected, your performance overview appears automatically."],
      ["Where can I see my content?", "Choose Content in the navigation to open your saved uploads or connected content library. Your content remains attached to your own creator account."],
      ["How does performance update?", "The overview reads the same recorded payments and activity as your earnings page. It refreshes every minute while the page is visible. Choose 7, 30 or 90 days to change the reporting period. New activity can take a little time to appear."],
      ["What do the numbers mean?", "Your earnings shows your share of recorded earnings for the selected period. Active fans counts people who sent a message. Conversations counts chats with activity during that period. Earnings are not a payout balance."],
      ["Can I update my personality?", "Choose Profile to review your saved answers or connected profile. Editing is available where your account allows it; preview accounts stay read-only."],
      ["Need a hand from the team?", `Contact your ${brandName} team through your usual onboarding contact. Include what you were trying to do and any message shown on screen so they can help.`],
    ].map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}</summary><p>{brandName === "Moxy" ? answer : answer.replace("Choose Content", "Choose My Content").replace("Choose Profile", "Choose My AI")}</p></details>)}</div>
    <section className={styles.profileStrip}><div><h2>Your account, at a glance.</h2><p>Check your profile and onboarding status.</p></div><Link className={styles.secondaryButton} href="/creator/info">Account information <ArrowRight size={16} /></Link></section>
  </div>;
}
