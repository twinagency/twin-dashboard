import type { ReactNode } from "react";
import TwinWordmark from "@/components/TwinWordmark";
import styles from "./login.module.css";

// The same original Link/LYNQ presentation for agency and creator auth.
// Each caller supplies its own form; this component grants no permissions.
export default function LoginShell({ children, heading = "Welcome back.", description = "Sign in to your LYNQ dashboard.", footer = "Your creators. Your conversations. One place." }: { children: ReactNode; heading?: string; description?: string; footer?: string }) {
  return (
    <main className={styles.scene} data-lynq-login="light">
      <div className={styles.wash} aria-hidden="true" data-login-wash="" />
      <div className={styles.workspace}>
        <div className={styles.brand}><TwinWordmark agencyName="LYNQ" /></div>
        <section className={styles.card} aria-labelledby="lynq-login-heading" data-login-card="">
          <p className={styles.eyebrow}>Your creator workspace</p>
          <h1 className={styles.heading} id="lynq-login-heading">{heading}</h1>
          <p className={styles.description}>{description}</p>
          {children}
        </section>
        <p className={styles.footer}>{footer}</p>
      </div>
    </main>
  );
}
