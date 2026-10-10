import { assertCsrf } from "@coppergate/auth";
import { ApiError } from "@coppergate/errors";
import { env } from "./env";

export function requireCsrf(request: Request): void {
  try {
    assertCsrf(request, env.APP_URL);
  } catch {
    throw new ApiError("forbidden", "CSRF check failed");
  }
}
