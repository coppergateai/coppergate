import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Load nearest .env / .env.local without overriding existing process.env. */
function hydrateDotenv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env.local"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      loadDotenv({ path: file, override: false });
    }
  }
}

/**
 * Non-production / build fallback. Override in real deployments.
 * (Next `next build` sets NODE_ENV=production, so we cannot hard-fail here.)
 */
export const DEV_SESSION_SECRET =
  "dev-only-coppergate-session-secret!!";

/** Dev-only 32-byte AES key (64 hex). Override in real deployments. */
export const DEV_CREDENTIALS_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OTEL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32).default(DEV_SESSION_SECRET),
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters")
    .default(DEV_CREDENTIALS_ENCRYPTION_KEY),
  /** Optional until OAuth login is used — enforced at `/api/auth/github`. */
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  /** GitHub App — optional until install flow is used. */
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_SLUG: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export type LoadEnvOptions = {
  env?: NodeJS.ProcessEnv;
  throwOnError?: boolean;
};

let cached: Env | undefined;

export function loadEnv(options: LoadEnvOptions = {}): Env {
  if (cached && !options.env) {
    return cached;
  }

  if (!options.env) {
    hydrateDotenv();
  }

  const result = envSchema.safeParse(options.env ?? process.env);
  if (!result.success) {
    const message = formatZodError(result.error);
    if (options.throwOnError) {
      throw new Error(message);
    }
    console.error(message);
    process.exit(1);
  }

  if (!options.env) {
    cached = result.data;
  }
  return result.data;
}

export function resetEnvCache(): void {
  cached = undefined;
}

export function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map(
    (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  return `Invalid environment configuration:\n${lines.join("\n")}`;
}

export { envSchema };
