"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { LogoutButton } from "@/app/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { track } from "@/lib/ga";
import { IconArrow, IconGithub } from "./icons";
import styles from "./marketing.module.css";

type Props = {
  signedIn: boolean;
};

const links = [
  { href: "/#arena", label: "Arena" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#evidence", label: "Evidence" },
  { href: "/#signals", label: "Integrations" },
  { href: "/#controls", label: "Controls" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function MarketingHeader({ signedIn }: Props) {
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
            className={styles.githubLink}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
            aria-label="Coppergate on GitHub"
          >
            <IconGithub />
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
                Open workspaces
                <IconArrow />
              </Link>
            </>
          )}

          <button
            type="button"
            className={styles.menuBtn}
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
            ) : (
              <>
                <Link href="/login" onClick={closeMenu}>
                  Sign in
                </Link>
                <Link className={styles.drawerCta} href="/login" onClick={closeMenu}>
                  Open workspaces
                </Link>
              </>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
