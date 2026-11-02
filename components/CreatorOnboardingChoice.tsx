import Link from "next/link";
import { ArrowRight, Check, Images, MessageCircle, Sparkles } from "lucide-react";
import styles from "./CreatorOnboardingChoice.module.css";

export default function CreatorOnboardingChoice() {
  return <section className={styles.root} data-creator-setup-panel data-onboarding-choice>
    <p className={styles.eyebrow}>LET'S MAKE IT YOURS</p>
    <h1>Your AI clone starts here.</h1>
    <p className={styles.intro}>Two ways to get set up. Choose what works for you.</p>
    <div className={styles.cards}>
      <section className={styles.card} data-onboarding-option="onlyfans">
        <div className={styles.top}><span className={styles.icon}><img src="/brand/platforms/onlyfans.svg" width="38" height="38" alt="" /></span><span className={styles.badge}><Sparkles size={13} /> Quick setup</span></div>
        <h2>Bring your OnlyFans.</h2>
        <p>Connect your account. We'll import your photos and videos and use your content to learn your personality and tone.</p>
        <ul><li><Check size={17} />Your media, imported for you</li><li><Check size={17} />Your personality, from your content</li><li><Check size={17} />Straight to your dashboard</li></ul>
        <Link className={styles.primary} href="/creator/onboarding?step=onlyfans">Sign in with OnlyFans<ArrowRight size={18} /></Link>
        <span className={styles.helper}>We'll prepare your clone in the background.</span>
      </section>
      <section className={styles.card} data-onboarding-option="manual">
        <div className={styles.top}><span className={styles.icon}><Images size={30} strokeWidth={1.5} /></span><span className={styles.quiet}>At your own pace</span></div>
        <h2>Tell us about you.</h2>
        <p>Upload your favourite photos and videos, then answer a few simple questions to make your AI feel like you.</p>
        <ul><li><Images size={17} />Add your photos and videos</li><li><MessageCircle size={17} />Answer the personality questions</li><li><Check size={17} />Continue the usual onboarding</li></ul>
        <Link className={styles.secondary} href="/creator/onboarding?step=content">Continue manually<ArrowRight size={18} /></Link>
        <span className={styles.helper}>Save your progress and come back any time.</span>
      </section>
    </div>
  </section>;
}
