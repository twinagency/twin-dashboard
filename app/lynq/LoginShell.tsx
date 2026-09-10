import type { ReactNode } from "react";
import TwinWordmark from "@/components/TwinWordmark";
import styles from "./login.module.css";

// Presentation shared by /link and /lynq. Keep the existing form and its
// endpoint supplied by each route; never move authentication into this shell.
export default function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.scene} data-lynq-login="light">
      <div className={styles.wash} aria-hidden="true" data-login-wash="" />
      <div className={styles.workspace}>
        <div className={styles.brand}>
          <TwinWordmark agencyName="LYNQ" />
        </div>
        <section className={styles.card} aria-labelledby="lynq-login-heading" data-login-card="">
          <p className={styles.eyebrow}>Your creator workspace</p>
          <h1 className={styles.heading} id="lynq-login-heading">Welcome back.</h1>
          <p className={styles.description}>Sign in to your LYNQ dashboard.</p>
          {children}
        </section>
        <p className={styles.footer}>Your creators. Your conversations. One place.</p>
      </div>
    </main>
  );
}
