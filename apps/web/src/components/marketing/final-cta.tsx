import Link from "next/link";
import { EarlyAccessForm } from "@/app/early-access-form";
import { IconArrow } from "./icons";
import styles from "./marketing.module.css";

type Props = {
  signedInLogin?: string | null;
};

export function FinalCta({ signedInLogin = null }: Props) {
  const signedIn = Boolean(signedInLogin);

  return (
    <section
      id="get-started"
      className={styles.final}
      aria-labelledby="final-title"
    >
      <div className={styles.finalInner}>
        <p className={styles.sectionEyebrow}>Private beta</p>
        <h2 id="final-title" className={styles.finalTitle}>
          Arm the arena.
          <br />
          Build what survives.
        </h2>
        <p className={styles.finalLede}>
          Bring your repository, define the objective, and explore controlled
          AI-driven software delivery. Design-partner seats are invitation-led —
          request access or open workspaces if you already have a seat.
        </p>

        <div className={styles.finalActions}>
          <Link
            className={styles.btnHeroPrimary}
            href={signedIn ? "/workspaces" : "/login"}
          >
            Open workspaces
            <IconArrow />
          </Link>
          <a className={styles.btnSecondary} href="mailto:muhtalipdede@gmail.com">
            Contact us
          </a>
        </div>

        {signedIn ? (
          <p id="early-access" className={styles.finalNote}>
            Signed in as @{signedInLogin}. Open workspaces above to continue.
          </p>
        ) : (
          <>
            <div id="early-access" className={styles.finalForm}>
              <EarlyAccessForm />
            </div>
            <p className={styles.finalNote}>
              No fake signup — waitlist and GitHub auth are the real paths into
              private beta.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
