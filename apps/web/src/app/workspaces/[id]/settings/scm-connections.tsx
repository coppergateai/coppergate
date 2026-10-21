"use client";

import { useCallback, useEffect, useState } from "react";
import { GithubPanel } from "./github-panel";
import { GitlabPanel } from "./gitlab-panel";
import styles from "./settings.module.css";

type Provider = "github" | "gitlab";

type Props = {
  workspaceId: string;
  canManage: boolean;
  initialQuery?: string;
  /** Prefer this provider when opening from ?github= / ?gitlab= */
  prefer?: Provider | null;
};

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 98 96"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GitlabMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#E24329"
        d="M18 35.163L24.663 14.67H11.337z"
      />
      <path
        fill="#FC6D26"
        d="M18 35.163L11.337 14.67H1.82zM18 35.163L24.663 14.67H34.18z"
      />
      <path
        fill="#FCA326"
        d="M1.82 14.67L.09 19.9a1.22 1.22 0 0 0 .443 1.365L18 35.163zM34.18 14.67l1.73 5.23a1.22 1.22 0 0 1-.443 1.365L18 35.163z"
      />
      <path
        fill="#E24329"
        d="M1.82 14.67h9.517L7.55 2.92a.61.61 0 0 0-1.16 0zM34.18 14.67h-9.517L28.45 2.92a.61.61 0 0 1 1.16 0z"
      />
    </svg>
  );
}

export function ScmConnectionsPanel({
  workspaceId,
  canManage,
  initialQuery,
  prefer = null,
}: Props) {
  const [provider, setProvider] = useState<Provider | null>(prefer);
  const [loading, setLoading] = useState(true);
  const [githubLive, setGithubLive] = useState(false);
  const [gitlabLive, setGitlabLive] = useState(false);

  const detect = useCallback(async () => {
    setLoading(true);
    try {
      const [gh, gl] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/github`, {
          credentials: "same-origin",
        }).then((r) => r.json() as Promise<{ installation?: { status?: string } | null }>),
        fetch(`/api/workspaces/${workspaceId}/gitlab`, {
          credentials: "same-origin",
        }).then((r) => r.json() as Promise<{ installation?: { status?: string } | null }>),
      ]);
      const ghOn = Boolean(gh.installation);
      const glOn = Boolean(gl.installation);
      setGithubLive(ghOn);
      setGitlabLive(glOn);

      if (prefer === "github" || prefer === "gitlab") {
        setProvider(prefer);
        return;
      }
      if (ghOn && !glOn) setProvider("github");
      else if (glOn && !ghOn) setProvider("gitlab");
      else if (ghOn && glOn) setProvider("github");
      else setProvider(null);
    } catch {
      setProvider(prefer);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, prefer]);

  useEffect(() => {
    void detect();
  }, [detect]);

  if (loading) {
    return (
      <section className={styles.section} aria-busy="true">
        <p className={styles.sectionLede}>Loading source control…</p>
      </section>
    );
  }

  if (!provider) {
    return (
      <section
        className={styles.section}
        aria-labelledby="scm-pick-heading"
      >
        <h2 id="scm-pick-heading" className={styles.sectionLabel}>
          Source control
        </h2>
        <p className={styles.sectionLede}>
          Pick one provider for this workspace. Contenders open PRs or MRs on
          the repos you connect next.
        </p>

        <div className={styles.scmPicker} role="list">
          <button
            type="button"
            className={styles.scmCard}
            role="listitem"
            disabled={!canManage}
            onClick={() => setProvider("github")}
          >
            <span className={styles.scmCardIcon} data-provider="github">
              <GithubMark className={styles.scmLogo} />
            </span>
            <span className={styles.scmCardBody}>
              <span className={styles.scmCardTitle}>GitHub</span>
              <span className={styles.scmCardText}>
                Install the Coppergate GitHub App and select repositories.
              </span>
            </span>
            <span className={styles.scmCardCta}>Continue</span>
          </button>

          <button
            type="button"
            className={styles.scmCard}
            role="listitem"
            disabled={!canManage}
            onClick={() => setProvider("gitlab")}
          >
            <span className={styles.scmCardIcon} data-provider="gitlab">
              <GitlabMark className={styles.scmLogo} />
            </span>
            <span className={styles.scmCardBody}>
              <span className={styles.scmCardTitle}>GitLab</span>
              <span className={styles.scmCardText}>
                Connect GitLab.com or self-managed and deliver merge requests.
              </span>
            </span>
            <span className={styles.scmCardCta}>Continue</span>
          </button>
        </div>

        {!canManage ? (
          <p className={styles.note}>Only workspace owners can connect SCM.</p>
        ) : null}
      </section>
    );
  }

  const other: Provider = provider === "github" ? "gitlab" : "github";
  const canSwitch =
    canManage &&
    ((provider === "github" && !githubLive) ||
      (provider === "gitlab" && !gitlabLive) ||
      (!githubLive && !gitlabLive));

  return (
    <div className={styles.scmActive}>
      <div className={styles.scmActiveBar}>
        <div className={styles.scmActiveIdentity}>
          <span
            className={styles.scmCardIcon}
            data-provider={provider}
            data-size="sm"
          >
            {provider === "github" ? (
              <GithubMark className={styles.scmLogo} />
            ) : (
              <GitlabMark className={styles.scmLogo} />
            )}
          </span>
          <div>
            <p className={styles.scmActiveTitle}>
              {provider === "github" ? "GitHub" : "GitLab"}
            </p>
            <p className={styles.scmActiveMeta}>
              Primary source control for this workspace
            </p>
          </div>
        </div>
        {canSwitch ? (
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => setProvider(other)}
          >
            Use {other === "github" ? "GitHub" : "GitLab"} instead
          </button>
        ) : null}
      </div>

      {provider === "github" ? (
        <GithubPanel
          workspaceId={workspaceId}
          canManage={canManage}
          initialQuery={initialQuery}
          embedded
        />
      ) : (
        <GitlabPanel
          workspaceId={workspaceId}
          canManage={canManage}
          initialQuery={initialQuery}
          embedded
        />
      )}
    </div>
  );
}
