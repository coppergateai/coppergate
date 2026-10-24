"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { LogoutButton } from "@/app/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { track } from "@/lib/ga";
import { IconArrow, IconGithub } from "./icons";
import styles from "./marketing.module.css";

type Props = {
  signedIn: boolean;
};

const SELF_HOST =
  "https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md";

const links = [
  { href: "/#arena", label: "Arena" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#evidence", label: "Evidence" },
  { href: "/#signals", label: "Integrations" },
  { href: "/docs/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
] as const;

export function MarketingHeader({ signedIn }: Props) {
  const pathname = usePathname();
  const onLogin = pathname === "/login";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header
      className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}
    >
      <div className={styles.headerInner}>
        <Link
          className={styles.brandLink}
          href="/"
          aria-label="Coppergate home"
          onClick={closeMenu}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.brandImg} ${styles.brandImgOnDark}`}
            src="/logo-lockup-white.svg"
            alt="Coppergate"
            width={148}
            height={32}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.brandImg} ${styles.brandImgOnLight}`}
            src="/logo-lockup-black.svg"
            alt="Coppergate"
            width={148}
            height={32}
          />
        </Link>

        <nav className={styles.navCenter} aria-label="Primary">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.navActions}>
          <ThemeToggle />
          <a
            className={styles.githubChip}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
            aria-label="Coppergate on GitHub"
            onClick={() => track("cta_github", { location: "nav" })}
          >
            <IconGithub />
            <span>GitHub</span>
          </a>

          {signedIn ? (
            <>
              <LogoutButton className={styles.navGhost} />
              <Link
                className={styles.btnPrimary}
                href="/workspaces"
                onClick={() => track("cta_open_workspaces", { location: "nav" })}
              >
                Open workspaces
                <IconArrow />
              </Link>
            </>
          ) : onLogin ? (
            <a
              className={styles.btnPrimary}
              href={SELF_HOST}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("cta_self_host", { location: "nav_login" })}
            >
              Self-host
              <IconArrow />
            </a>
          ) : (
            <>
              <Link className={styles.navGhost} href="/login">
                Sign in
              </Link>
              <Link
                className={styles.btnPrimary}
                href="/login"
                onClick={() => track("cta_open_workspaces", { location: "nav" })}
              >
                Try hosted
                <IconArrow />
              </Link>
            </>
          )}

          <button
            type="button"
            className={`${styles.menuBtn} ${menuOpen ? styles.menuBtnOpen : ""}`}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.menuBar} />
            <span className={styles.menuBar} />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div id={menuId} className={styles.drawer}>
          <nav aria-label="Mobile">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
            <div className={styles.drawerThemeRow}>
              <span>Theme</span>
              <ThemeToggle />
            </div>
            <a
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
              onClick={closeMenu}
            >
              GitHub
            </a>
            {signedIn ? (
              <>
                <LogoutButton />
                <Link
                  className={styles.drawerCta}
                  href="/workspaces"
                  onClick={closeMenu}
                >
                  Open workspaces
                </Link>
              </>
            ) : onLogin ? (
              <a
                className={styles.drawerCta}
                href={SELF_HOST}
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
              >
                Self-host guide
              </a>
            ) : (
              <>
                <Link href="/login" onClick={closeMenu}>
                  Sign in
                </Link>
                <Link
                  className={styles.drawerCta}
                  href="/login"
                  onClick={closeMenu}
                >
                  Try hosted
                </Link>
              </>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
