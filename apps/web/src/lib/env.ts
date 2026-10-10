import { loadEnv } from "@coppergate/config";

/** Validated env for the web app — fails fast at import/boot. */
export const env = loadEnv();
