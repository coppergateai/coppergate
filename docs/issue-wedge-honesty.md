# Issue → verified PR wedge honesty (P-146)

PRODUCT **D14** locks the commercial KPI to **GitHub issue → verified PR** on **existing-repo** projects. The measured path is:

**Import → Arena → CI → Accept**

Budget is a prerequisite (hard stop before agents run), not a KPI stage. Brief → plan remains a **new-product demo** path — not the paid pilot wedge.

## Program-bound spend

When maintainer policy binds `architectureRepo`, Arena reserve requires an **Open Program ID** in the task title (Spend License). The product refuses freestyle Arena invent without that ID.

UI copy on **Overview → GitHub issues** and the **Next action** pipeline is driven by pure helpers in `@coppergate/db` (`issue-wedge-honesty.ts`).

## Next action pipeline

| Step | Meaning |
| --- | --- |
| Budget | Active spend envelope |
| Import | Linked GitHub issue imported and queued |
| Arena | Contenders running under cap |
| CI | Task `WAITING_CI` — Accept blocked until checks pass |
| Accept | `REVIEW_REQUIRED` — Evidence Center Accept when gates clear |

## Tests

- `packages/db/src/issue-wedge-honesty.test.ts` — KPI copy, program-bound notes, next-step ordering (CI before Accept)

See also [`WEDGE.md`](./WEDGE.md) and [`docs/open-program-runtime`](../apps/web/src/app/docs/open-program-runtime/page.tsx) (Spend License).
