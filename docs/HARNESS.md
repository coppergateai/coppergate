# Contender harness BYO (Phase V)

Coppergate arena can run contenders through a `ContenderHarness` port (`@coppergate/agents`).

| Kind | Status | Notes |
|---|---|---|
| `native_fake` | Shipped | Deterministic FakeCodingAgent |
| `native_openai` | Shipped | OpenAI-compatible CodingAgent |
| `cursor_local` | Shipped | Cursor local SDK (`@cursor/sdk`); BYOK vendor=`cursor` or `CURSOR_API_KEY` |
| `openhands` / `aider` | Stub | Falls back to Fake until sandbox wire-up (TASK114) |
| `cursor_cloud` / `codex` | Stub | Cloud Background Agents wait-state (TASK115) |

```ts
import { createContenderHarness, harnessAsCodingAgent } from "@coppergate/agents";

const harness = createContenderHarness({ kind: "cursor_local" });
const agent = harnessAsCodingAgent(harness);
```

Prefer workspace Settings → LLM BYOK (`cursor` vendor) and per-agent routing over `CONTENDER_HARNESS`. When an OpenAI-compatible primary hits `provider_quota`, a workspace Cursor credential (or `CURSOR_API_KEY`) is used once via `FailoverCodingAgent`.

Security: harnesses must not escalate autonomy; secrets stay scrubbed via existing run event redaction. Cursor mutates the sandbox workdir in place; path allowlists are enforced on the post-run diff.
