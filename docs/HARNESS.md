# Contender harness BYO (Phase V)

Coppergate arena can run contenders through a `ContenderHarness` port (`@coppergate/agents`).

| Kind | Status | Notes |
|---|---|---|
| `native_fake` | Shipped | Deterministic FakeCodingAgent |
| `native_openai` | Shipped | OpenAI-compatible CodingAgent |
| `openhands` / `aider` | Stub | Falls back to Fake until sandbox wire-up (TASK114) |
| `cursor_cloud` / `codex` | Stub | Wait-state for public API (TASK115) |

```ts
import { createContenderHarness, harnessAsCodingAgent } from "@coppergate/agents";

const harness = createContenderHarness({ kind: "openhands" });
const agent = harnessAsCodingAgent(harness);
```

Security: harnesses must not escalate autonomy; secrets stay scrubbed via existing run event redaction.
