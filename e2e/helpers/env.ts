import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

export type ProjectTarget = {
  workspaceId: string;
  projectId: string;
  projectUrl: string;
};

export function loadE2eEnv(): void {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function baseUrl(): string {
  return (process.env.BASE_URL ?? "https://www.coppergate.ai").replace(
    /\/$/,
    "",
  );
}

export function authStatePath(): string {
  return resolve(root, ".auth/user.json");
}

export function sessionMetaPath(): string {
  return resolve(root, ".auth/session.json");
}

export function resolveProjectTarget(): ProjectTarget {
  loadE2eEnv();

  const fromUrl = process.env.CG_PROJECT_URL?.trim();
  if (fromUrl) {
    const parsed = parseProjectUrl(fromUrl);
    if (parsed) return parsed;
    throw new Error(`CG_PROJECT_URL is not a project URL: ${fromUrl}`);
  }

  const workspaceId = process.env.CG_WORKSPACE_ID?.trim();
  const projectId = process.env.CG_PROJECT_ID?.trim();
  if (workspaceId && projectId) {
    return {
      workspaceId,
      projectId,
      projectUrl: `${baseUrl()}/workspaces/${workspaceId}/projects/${projectId}`,
    };
  }

  const metaPath = sessionMetaPath();
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      projectUrl?: string;
      workspaceId?: string;
      projectId?: string;
    };
    if (meta.projectUrl) {
      const parsed = parseProjectUrl(meta.projectUrl);
      if (parsed) return parsed;
    }
    if (meta.workspaceId && meta.projectId) {
      return {
        workspaceId: meta.workspaceId,
        projectId: meta.projectId,
        projectUrl: `${baseUrl()}/workspaces/${meta.workspaceId}/projects/${meta.projectId}`,
      };
    }
  }

  throw new Error(
    "No project target. Run `pnpm e2e:login` and pick a project, or set CG_PROJECT_URL in e2e/.env",
  );
}

export function parseProjectUrl(url: string): ProjectTarget | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(
      /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/?$/,
    );
    if (!m) return null;
    return {
      workspaceId: m[1]!,
      projectId: m[2]!,
      projectUrl: `${u.origin}/workspaces/${m[1]}/projects/${m[2]}`,
    };
  } catch {
    return null;
  }
}

export function githubRepo(): string {
  return process.env.GITHUB_REPO?.trim() || "kprompt/kprompt-website";
}

export function githubToken(): string | undefined {
  return process.env.GITHUB_TOKEN?.trim() || undefined;
}

export function githubPrLimit(): number {
  const n = Number(process.env.GITHUB_PR_LIMIT ?? "15");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
}
