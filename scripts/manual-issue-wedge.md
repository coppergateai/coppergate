# Manual / operator: primary issue → CI wedge

Product path (preferred for pilots): Project → **Issues** → **Import → queue** → task review → Accept.

Operator staging proof (same DB APIs as the UI — no SQL surgery):

```bash
# Local DB + local worker (GITHUB_DELIVERY_MODE=http), or remote Fly DB URL:
gh issue create -R coppergateai/coppergate-staging-smoke \
  --title "Wedge proof: tiny change" --body "Touch app/page.tsx; Closes this issue."

STAGING_ALLOW_LOCAL=1 \
  GITHUB_INSTALLATION_ID=… \
  GITHUB_REPO_ID=1416068344 \
  GITHUB_REPO_FULL_NAME=coppergateai/coppergate-staging-smoke \
  ISSUE_NUMBER=N \
  ISSUE_TITLE='…' ISSUE_BODY='…' \
  PROVE_NEGATIVE=1 \
  pnpm --filter @coppergate/worker exec node --import tsx scripts/prove-issue-wedge.mjs
```

`PROVE_NEGATIVE=1` attaches a failing check after Accept and asserts the Accept API rejects (`Cannot accept: CI checks failed…`).

## Proven

| Date | Evidence |
|---|---|
| 2026-10-17 | Issue [#4](https://github.com/coppergateai/coppergate-staging-smoke/issues/4) → [PR #5](https://github.com/coppergateai/coppergate-staging-smoke/pull/5) → Accept DONE + CI-fail reject |

Smoke repo CI workflow: `.github/workflows/ci.yml` (check_run surface for live webhooks).
