"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { LogoutButton } from "./logout-button";
import styles from "./landing.module.css";

type Props = {
  signedIn: boolean;
};

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Product" },
  { href: "/security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader({ signedIn }: Props) {
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
      className={`${styles.nav} ${scrolled ? styles.navScrolled : ""} ${menuOpen ? styles.navMenuOpen : ""}`}
    >
      <div className={styles.navInner}>
        <div className={styles.navBrandGroup}>
          <Link
            className={styles.navBrandLink}
            href="/"
            aria-label="Coppergate home"
            onClick={closeMenu}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.navBrand}
              src="/logo-lockup-white.svg"
              alt="Coppergate"
              width={148}
              height={32}
            />
          </Link>
          <span className={styles.navBadge}>Private beta</span>
        </div>

        <nav className={styles.navLinks} aria-label="Primary">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.navActions}>
          {signedIn ? (
            <>
              <Link className={styles.navLink} href="/workspaces">
                Workspaces
              </Link>
              <span className={styles.navDivider} aria-hidden="true" />
              <LogoutButton className={styles.navGhost} />
            </>
          ) : (
            <>
              <Link className={`${styles.navLink} ${styles.navLinkDesktop}`} href="/login">
                Sign in
              </Link>
              <Link className={styles.navCta} href="/#early-access">
                Request access
              </Link>
            </>
          )}

          <button
            type="button"
            className={styles.navMenuBtn}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.navMenuBar} aria-hidden="true" />
            <span className={styles.navMenuBar} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        id={menuId}
        className={`${styles.navDrawer} ${menuOpen ? styles.navDrawerOpen : ""}`}
        hidden={!menuOpen}
      >
        <nav className={styles.navDrawerNav} aria-label="Mobile">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={closeMenu}>
              {link.label}
            </Link>
          ))}
          {signedIn ? (
            <Link href="/workspaces" onClick={closeMenu}>
              Workspaces
            </Link>
          ) : (
            <>
              <Link href="/login" onClick={closeMenu}>
                Sign in
              </Link>
              <Link
                className={styles.navDrawerCta}
                href="/#early-access"
                onClick={closeMenu}
              >
                Request access
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
