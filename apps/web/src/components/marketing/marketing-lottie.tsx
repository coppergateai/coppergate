"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import styles from "./marketing.module.css";

const DotLottieReact = dynamic(
  () =>
    import("@lottiefiles/dotlottie-react").then((mod) => {
      mod.setWasmUrl("/vendor/dotlottie-player.wasm");
      return mod.DotLottieReact;
    }),
  { ssr: false, loading: () => <span className={styles.lottieSlot} aria-hidden="true" /> },
);

type Props = {
  src: string;
  className?: string;
  label?: string;
  loop?: boolean;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function MarketingLottie({
  src,
  className,
  label = "Decorative animation",
  loop = true,
}: Props) {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <span
        className={`${styles.lottieSlot} ${styles.lottieStatic} ${className ?? ""}`}
        role="img"
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={`${styles.lottieSlot} ${className ?? ""}`}
      role="img"
      aria-label={label}
    >
      <DotLottieReact src={src} autoplay loop={loop} style={{ width: "100%", height: "100%" }} />
    </span>
  );
}
