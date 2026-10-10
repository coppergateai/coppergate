/**
 * Webhook handler stubs — TASK006.
 * Real side effects (validation mapping, etc.) land in later tasks.
 */

export type WebhookHandlerResult = {
  handled: boolean;
  note: string;
};

export type InstallationWebhookPayload = {
  action?: string;
  installation?: { id?: number };
};

export type CheckRunWebhookPayload = {
  action?: string;
  check_run?: { id?: number; status?: string; conclusion?: string | null };
  repository?: { full_name?: string };
};

export function handleInstallationEventStub(
  payload: InstallationWebhookPayload,
): WebhookHandlerResult {
  const action = payload.action ?? "unknown";
  const installationId = payload.installation?.id;
  return {
    handled: true,
    note: `installation.${action} stub (installation=${installationId ?? "?"})`,
  };
}

export function handleCheckRunEventStub(
  payload: CheckRunWebhookPayload,
): WebhookHandlerResult {
  const action = payload.action ?? "unknown";
  const checkId = payload.check_run?.id;
  const repo = payload.repository?.full_name;
  return {
    handled: true,
    note: `check_run.${action} stub (check=${checkId ?? "?"}, repo=${repo ?? "?"})`,
  };
}

/** Map installation webhook action → local status, if applicable. */
export function installationStatusFromAction(
  action: string | undefined,
): "active" | "suspended" | "removed" | null {
  switch (action) {
    case "deleted":
    case "suspend":
      return action === "deleted" ? "removed" : "suspended";
    case "unsuspend":
    case "created":
    case "new_permissions_accepted":
      return "active";
    default:
      return null;
  }
}
