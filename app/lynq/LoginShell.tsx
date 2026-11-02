import type { ReactNode } from "react";
import TwinWordmark from "@/components/TwinWordmark";
import styles from "./login.module.css";

// Presentation shared by /link and /lynq. Keep the existing form and its
// endpoint supplied by each route; never move authentication into this shell.
export default function LoginShell({
  children,
  eyebrow = "Your creator workspace",
  heading = "Welcome back.",
  description = "Sign in to your LYNQ dashboard.",
  footer = "Your creators. Your conversations. One place.",
  creatorAuth = false,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  heading?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  creatorAuth?: boolean;
}) {
  return (
    <main
      className={styles.scene}
      data-lynq-login="light"
      data-creator-auth-brand={creatorAuth ? "link" : undefined}
    >
      <div className={styles.wash} aria-hidden="true" data-login-wash="" />
      <div className={styles.workspace}>
        <div className={styles.brand}>
          <TwinWordmark agencyName="LYNQ" />
        </div>
        <section className={styles.card} aria-labelledby="lynq-login-heading" data-login-card="">
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.heading} id="lynq-login-heading">{heading}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
          {children}
        </section>
        {footer ? <p className={styles.footer}>{footer}</p> : null}
      </div>
    </main>
  );
}
