export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "not_ready"
  | "internal";

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    correlationId: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.code = code;
    this.status = options?.status ?? defaultStatus(code);
    this.details = options?.details;
  }
}

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "not_ready":
      return 503;
    default:
      return 500;
  }
}

export function toErrorEnvelope(
  err: unknown,
  correlationId: string,
): { status: number; body: ApiErrorBody } {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          correlationId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "internal",
        message: "Internal server error",
        correlationId,
      },
    },
  };
}
