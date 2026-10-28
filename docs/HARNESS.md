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

**Production default (live http):** when a workspace Cursor BYOK exists (or `CURSOR_API_KEY` on self-host), the worker prefers **`cursor_local`** as the primary coding path. OpenAI-compatible chat→file-write is demoted to failover / explicit `CONTENDER_HARNESS=native_openai`. Prefer Settings → LLM BYOK (`cursor` vendor) over env. Hosted production does not share operator `CURSOR_API_KEY` / `LLM_*` across tenants (`ALLOW_ENV_LLM_KEYS=1` for single-tenant self-host only). OpenHands/Aider stubs are never the default.

**Honesty (AG-013):** each live run emits a `coding_path_honesty` progress event before agent work (primary harness, BYOK vs env source, and when `native_openai` was demoted because Cursor BYOK won). Arena contender activity lines and the run inspector show that text while the run is `RUNNING`; `provider_failover` progress still surfaces the failover reason when quota failover engages.

Security: harnesses must not escalate autonomy; secrets stay scrubbed via existing run event redaction. Cursor mutates the sandbox workdir in place; path allowlists are enforced on the post-run diff.
