# Email ops (`hello@coppergate.ai`)

Canonical setup (DNS + ImprovMX):  
[`coppergate-architecture/docs/EMAIL.md`](../../coppergate-architecture/docs/EMAIL.md)

**Status (architecture doc):** Live as of 2026-10-13 — MX/SPF via Vercel DNS + ImprovMX forward to founder inbox.

## Operator checklist

1. Send a test from a non-founder account → `hello@coppergate.ai` → personal inbox.
2. Reply from the forwarded inbox (or configured alias) within one business day during Phase 0.
3. Public surfaces already point here: landing footer, `/docs/pricing`, GTM, GitHub org.
4. Outbound “From: hello@…” (Resend / Workspace) is **not** required for MVP contact — forwarding is enough.

## Verify DNS

```bash
dig NS coppergate.ai +short
dig MX coppergate.ai +short
dig TXT coppergate.ai +short
```

Expect Vercel NS, ImprovMX MX, SPF `include:spf.improvmx.com`.

## Phase 0 mail flow

1. `pnpm ops:waitlist` — export signups  
2. `pnpm ops:outreach-pack` — invite codes + email bodies → `docs/ops/_generated/`  
3. Send from / reply via `hello@coppergate.ai`  
4. Mark rows `status=sent` in [`ops/icp-40.csv`](./ops/icp-40.csv)

See [PHASE0_OPS.md](./PHASE0_OPS.md).
