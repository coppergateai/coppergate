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

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).optional(),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  OTEL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

export type LoadEnvOptions = {
  /** Override process.env (tests). */
  env?: NodeJS.ProcessEnv;
  /** When true, throw instead of process.exit (tests). Default false. */
  throwOnError?: boolean;
};

let cached: Env | undefined;

/**
 * Parse and cache environment. Fails fast on invalid/missing required vars.
 */
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

/** Reset cache (tests only). */
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
