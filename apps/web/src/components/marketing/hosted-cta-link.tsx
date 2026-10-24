"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { documentHasSessionCookie } from "@/lib/session-cookie";

type Props = {
  className?: string;
  signedOutLabel?: string;
  signedInLabel?: string;
  onClick?: () => void;
};

/**
 * Hosted CTA that upgrades to /workspaces after mount when a session cookie
 * exists. Server HTML stays signed-out (stable for SEO / no Suspense H1 dupes).
 */
export function HostedCtaLink({
  className,
  signedOutLabel = "Try hosted",
  signedInLabel = "Open workspaces",
  onClick,
}: Props) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(documentHasSessionCookie());
  }, []);

  return (
    <Link
      className={className}
      href={signedIn ? "/workspaces" : "/login"}
      onClick={onClick}
    >
      {signedIn ? signedInLabel : signedOutLabel}
    </Link>
  );
}
