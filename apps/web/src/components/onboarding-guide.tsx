import Link from "next/link";
import type { CSSProperties } from "react";

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  done: boolean;
};

type Props = {
  title?: string;
  steps: OnboardingStep[];
};

/** First-run guided path (TASK034). */
export function OnboardingGuide({
  title = "Getting started",
  steps,
}: Props) {
  const next = steps.find((s) => !s.done) ?? null;

  return (
    <section style={{ marginTop: "1.75rem", marginBottom: "0.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.35rem" }}>
        {title}
      </h2>
      <p style={{ margin: "0 0 0.85rem", color: "#737373", fontSize: "0.85rem" }}>
        {next
          ? `Next: ${next.title}`
          : "You’re set — approve a task when ready."}
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((step, i) => (
          <li
            key={step.id}
            style={{
              display: "flex",
              gap: "0.75rem",
              padding: "0.55rem 0",
              borderBottom: "1px solid #262626",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ color: step.done ? "#86EFAC" : "#737373", width: 18 }}>
              {step.done ? "✓" : i + 1}
            </span>
            <div style={{ flex: 1 }}>
              {step.href && !step.done ? (
                <Link href={step.href} style={link}>
                  {step.title}
                </Link>
              ) : (
                <span style={{ color: step.done ? "#A3A3A3" : "#E5E5E5" }}>
                  {step.title}
                </span>
              )}
              <div style={{ color: "#737373", marginTop: 2 }}>{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const link: CSSProperties = {
  color: "#FFFFFF",
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
