/**
 * One-shot: seal Fly env CURSOR_API_KEY (+ optional LLM_API_KEY) into
 * workspace BYOK for the operator dogfood workspaces, then exit.
 *
 * Run on the worker machine while env keys still exist:
 *   fly ssh console -a coppergate-worker -C 'node /tmp/ops-migrate-env-llm-to-byok.mjs'
 */
import { createDb, createLlmByok, listLlmByok, closeDb } from "@coppergate/db";
import { parseEncryptionKey, sealSecret } from "@coppergate/github";

const WORKSPACES = [
  "2c894510-810e-46cc-8ff0-652f63870639", // coppergate dogfood
  "1cf1a253-cbcd-4b5f-b1b2-39c5e182e99a", // kprompt dogfood
];

const actor = "ops:migrate-env-llm-to-byok";
const url = process.env.DATABASE_URL;
const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
const cursorKey = process.env.CURSOR_API_KEY?.trim();
const cursorModel = process.env.CURSOR_MODEL?.trim() || "composer-2.5";
const llmKey = process.env.LLM_API_KEY?.trim();
const llmModel = process.env.LLM_MODEL?.trim() || "gpt-4.1-mini";

if (!url || !keyHex) {
  console.error("DATABASE_URL and CREDENTIALS_ENCRYPTION_KEY required");
  process.exit(1);
}
if (!cursorKey && !llmKey) {
  console.error("No CURSOR_API_KEY or LLM_API_KEY in env — nothing to migrate");
  process.exit(1);
}

const encKey = parseEncryptionKey(keyHex);
const db = createDb(url, { max: 1 });
const summary = [];

try {
  for (const workspaceId of WORKSPACES) {
    const existing = await listLlmByok(db, workspaceId);
    const vendors = existing.map((c) => c.vendor.toLowerCase());
    const row = { workspaceId, added: [], skipped: [] };

    if (cursorKey) {
      if (vendors.includes("cursor")) {
        row.skipped.push("cursor");
      } else {
        const meta = await createLlmByok(db, {
          workspaceId,
          actor,
          vendor: "cursor",
          label: "cursor-composer",
          model: cursorModel,
          encryptedPayload: sealSecret(cursorKey, encKey),
          setDefault: false,
        });
        row.added.push(`cursor:${meta.id}`);
      }
    }

    if (llmKey) {
      if (vendors.includes("openai") || vendors.includes("openai-compatible")) {
        row.skipped.push("openai");
      } else {
        const meta = await createLlmByok(db, {
          workspaceId,
          actor,
          vendor: "openai",
          label: "openai-gpt-4-1-mini",
          model: llmModel,
          baseUrl: "https://api.openai.com/v1",
          encryptedPayload: sealSecret(llmKey, encKey),
          setDefault: existing.length === 0,
        });
        row.added.push(`openai:${meta.id}`);
      }
    }

    summary.push(row);
  }
  console.log(JSON.stringify({ ok: true, summary }, null, 2));
} finally {
  await closeDb(db);
}
