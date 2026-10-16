import {
  isStripeConfigured,
  type StripeBillingConfig,
} from "@coppergate/billing";
import { loadEnv } from "@coppergate/config";

/** Resolve Stripe config from env; null when hosted billing is disabled. */
export function getStripeBillingConfig(): StripeBillingConfig | null {
  const env = loadEnv();
  const cfg: StripeBillingConfig = {
    secretKey: env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    priceStarter: env.STRIPE_PRICE_STARTER ?? "",
    pricePro: env.STRIPE_PRICE_PRO ?? "",
    appUrl: env.APP_URL,
  };
  return isStripeConfigured(cfg) ? cfg : null;
}
