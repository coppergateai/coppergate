/**
 * Thin HTTP client for OPP verify API — Coppergate as first runtime consumer (D16).
 */

export type OppSpendDecision = {
  allowed: boolean;
  reason?: string;
  openId?: string;
};

export type OppClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

export class OppClient {
  readonly baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: OppClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.OPP_API_URL ??
      "http://127.0.0.1:8790"
    ).replace(/\/$/, "");
    this.#fetch = options.fetch ?? fetch;
  }

  async health(): Promise<{ ok: boolean; protocolVersion?: string }> {
    const res = await this.#fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`opp_health_${res.status}`);
    return (await res.json()) as { ok: boolean; protocolVersion?: string };
  }

  async evaluateSpend(input: {
    markdown: string;
    openId?: string | null;
  }): Promise<OppSpendDecision> {
    const res = await this.#fetch(`${this.baseUrl}/v1/spend/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { decision: OppSpendDecision };
    return body.decision;
  }

  async verifyReceipt(input: {
    markdown: string;
    receipt: Record<string, unknown>;
  }): Promise<{ ok: boolean; reason?: string; openId?: string }> {
    const res = await this.#fetch(`${this.baseUrl}/v1/receipts/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as {
      result: { ok: boolean; reason?: string; openId?: string };
    };
    return body.result;
  }
}
