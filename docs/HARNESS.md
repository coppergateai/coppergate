# Contender harness BYO (Phase V)

Coppergate arena can run contenders through a `ContenderHarness` port (`@coppergate/agents`).

| Kind | Status | Notes |
|---|---|---|
| `native_fake` | Shipped | Deterministic FakeCodingAgent |
| `native_openai` | Shipped | OpenAI-compatible CodingAgent |
| `cursor_local` | Shipped | Cursor local SDK (`@cursor/sdk`); BYOK vendor=`cursor` or `CURSOR_API_KEY` |
| `claude_code` | Shipped | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`); BYOK vendor=`claude_code` or `ANTHROPIC_API_KEY` |
| `openhands` / `aider` | Disabled | Fail-closed (`harness_stub_disabled`); no Fake/scaffold stub path |
| `cursor_cloud` / `codex` | Disabled | Fail-closed until public API; no Fake fallback |

```ts
import { createContenderHarness, harnessAsCodingAgent } from "@coppergate/agents";

const harness = createContenderHarness({ kind: "cursor_local" });
// or: createContenderHarness({ kind: "claude_code" })
const agent = harnessAsCodingAgent(harness);
```

**Production default (live http):** when a workspace Cursor BYOK exists (or `CURSOR_API_KEY` on self-host), the worker prefers **`cursor_local`** as the primary coding path. If Cursor is absent but Claude Code BYOK / `ANTHROPIC_API_KEY` is present, **`claude_code`** is preferred instead. OpenAI-compatible chat→file-write is demoted to failover / explicit `CONTENDER_HARNESS=native_openai`. Prefer Settings → LLM BYOK (`cursor` or `claude_code` vendor) over env. Hosted production does not share operator provider keys across tenants (`ALLOW_ENV_LLM_KEYS=1` for single-tenant self-host only). `ALLOW_HARNESS_STUB` is ignored — OpenHands/Aider/Cursor Cloud stub scaffolds were removed.

**Honesty (AG-013):** each live run emits a `coding_path_honesty` progress event before agent work (primary harness, BYOK vs env source, and when `native_openai` was demoted because Cursor/Claude Code BYOK won). Arena contender activity lines and the run inspector show that text while the run is `RUNNING`; `provider_failover` progress still surfaces the failover reason when quota failover engages.

Security: harnesses must not escalate autonomy; secrets stay scrubbed via existing run event redaction. Cursor and Claude Code mutate the sandbox workdir in place; path allowlists are enforced on the post-run diff. Claude Code runs with `permissionMode: acceptEdits` and Bash disallowed.
