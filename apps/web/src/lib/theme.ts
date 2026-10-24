export const THEME_STORAGE_KEY = "cg-theme";

export type Theme = "dark" | "light";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}
