import { redactLogFields, redactLogString } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type Logger = {
  child(fields: LogFields): Logger;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export type CreateLoggerOptions = {
  service: string;
  level?: LogLevel;
  base?: LogFields;
  /** Inject for tests. */
  write?: (line: string) => void;
};

export function createLogger(options: CreateLoggerOptions): Logger {
  const min = LEVEL_ORDER[options.level ?? "info"];
  const write =
    options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const base = { service: options.service, ...options.base };

  const log = (level: LogLevel, message: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] < min) return;
    const safeFields = redactLogFields(fields);
    const safeBase = redactLogFields(base);
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: redactLogString(message),
      ...safeBase,
      ...safeFields,
    };
    write(JSON.stringify(entry));
  };

  return {
    child(fields) {
      return createLogger({
        service: options.service,
        level: options.level,
        base: { ...base, ...fields },
        write,
      });
    },
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}
