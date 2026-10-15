/**
 * TASK120 — Enterprise SSO (OIDC/SAML) + SCIM skeleton.
 * GitHub OAuth remains the default; this documents the enterprise path.
 */

export type SsoProtocol = "oidc" | "saml";

export type SsoIdpConfig = {
  protocol: SsoProtocol;
  /** e.g. Okta / Entra issuer */
  issuer: string;
  clientId: string;
  /** Never log; store encrypted at rest. */
  clientSecretRef?: string;
  /** Optional SAML metadata URL */
  metadataUrl?: string;
  /** Workspace that owns this IdP binding */
  workspaceId: string;
};

export type ScimUserPayload = {
  userName: string;
  externalId: string;
  active: boolean;
  emails?: Array<{ value: string; primary?: boolean }>;
  displayName?: string;
};

export type ScimProvisionResult =
  | { ok: true; action: "created" | "updated" | "noop"; userId?: string }
  | { ok: false; error: string };

/** Validate OIDC discovery-ish config shape (no network). */
export function validateSsoIdpConfig(
  input: Partial<SsoIdpConfig>,
): { ok: true; config: SsoIdpConfig } | { ok: false; error: string } {
  if (!input.workspaceId) return { ok: false, error: "workspaceId required" };
  if (input.protocol !== "oidc" && input.protocol !== "saml") {
    return { ok: false, error: "protocol must be oidc|saml" };
  }
  if (!input.issuer?.startsWith("https://")) {
    return { ok: false, error: "issuer must be https URL" };
  }
  if (!input.clientId) return { ok: false, error: "clientId required" };
  return {
    ok: true,
    config: {
      protocol: input.protocol,
      issuer: input.issuer,
      clientId: input.clientId,
      clientSecretRef: input.clientSecretRef,
      metadataUrl: input.metadataUrl,
      workspaceId: input.workspaceId,
    },
  };
}

/**
 * SCIM user provision stub — records intent only.
 * Wire to users/memberships when enterprise SSO lands.
 */
export function scimProvisionUserStub(
  payload: ScimUserPayload,
): ScimProvisionResult {
  if (!payload.userName || !payload.externalId) {
    return { ok: false, error: "userName and externalId required" };
  }
  if (!payload.active) {
    return { ok: true, action: "noop" };
  }
  return { ok: true, action: "created" };
}

/** Authorize URL placeholder for OIDC (authorization code). */
export function oidcAuthorizeUrl(input: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const base = input.issuer.replace(/\/$/, "");
  const u = new URL(`${base}/oauth2/v1/authorize`);
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("state", input.state);
  u.searchParams.set("scope", input.scope ?? "openid profile email");
  return u.toString();
}
