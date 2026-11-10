import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESIGN_SCOUT_SECTION_HEADING,
  appendDesignScoutOpenRowsToMarkdown,
  designScoutFingerprint,
  formatDesignIssueBody,
  proposeDesignIssues,
  proposeDesignOpenRows,
  resolveDesignScoutRoutes,
  shotHasDesignFinding,
  type DesignShot,
} from "./design-scout.js";

function shot(
  partial: Partial<DesignShot> & Pick<DesignShot, "name" | "url" | "path">,
): DesignShot {
  return {
    metrics: {
      client: 1440,
      scrollW: 1440,
      hScroll: false,
      mainW: 1200,
      overflowRight: [],
      title: "Test",
    },
    ...partial,
  };
}

describe("design scout propose", () => {
  it("flags horizontal overflow metrics", () => {
    assert.equal(
      shotHasDesignFinding({
        client: 1440,
        scrollW: 1600,
        hScroll: true,
        mainW: 1200,
        overflowRight: [],
        title: "x",
      }),
      true,
    );
    assert.equal(
      shotHasDesignFinding({
        client: 1440,
        scrollW: 1440,
        hScroll: false,
        mainW: 1200,
        overflowRight: [],
        title: "x",
      }),
      false,
    );
  });

  it("dedups root path `/` via title and scout body marker", () => {
    const proposed = proposeDesignIssues({
      shots: [
        shot({
          name: "landing",
          url: "https://www.coppergate.ai/",
          path: "/",
          metrics: {
            client: 1440,
            scrollW: 1600,
            hScroll: true,
            mainW: 1200,
            overflowRight: [{ cls: "hero", right: 1500 }],
            title: "Coppergate",
          },
        }),
      ],
      openIssues: [
        {
          title: "design: fix layout overflow on /",
          body: "<!-- coppergate-design-scout runId=x shot=landing path=/ -->",
          labels: ["design"],
        },
      ],
      max: 2,
      runId: "run-2",
    });
    assert.equal(proposed.length, 0);
  });

  it("dedups against open design issues and respects max", () => {
    const shots = [
      shot({
        name: "landing",
        url: "https://www.coppergate.ai/",
        path: "/",
        metrics: {
          client: 1440,
          scrollW: 1600,
          hScroll: true,
          mainW: 1200,
          overflowRight: [{ cls: "hero", right: 1500 }],
          title: "Coppergate",
        },
      }),
      shot({
        name: "pricing",
        url: "https://www.coppergate.ai/docs/pricing",
        path: "/docs/pricing",
        metrics: {
          client: 1440,
          scrollW: 1500,
          hScroll: true,
          mainW: 1100,
          overflowRight: [],
          title: "Pricing",
        },
      }),
      shot({
        name: "docs",
        url: "https://www.coppergate.ai/docs",
        path: "/docs",
        metrics: {
          client: 1440,
          scrollW: 1440,
          hScroll: false,
          mainW: 1100,
          overflowRight: [],
          title: "Docs",
        },
      }),
    ];
    const proposed = proposeDesignIssues({
      shots,
      openIssues: [
        {
          title: "design: fix layout overflow on /",
          labels: ["design", "ux"],
        },
      ],
      max: 2,
      runId: "run-1",
      imageMarkdownByShot: {
        pricing: "![pricing](https://raw.githubusercontent.com/o/r/main/x.png)",
      },
    });
    assert.equal(proposed.length, 1);
    assert.equal(proposed[0]?.path, "/docs/pricing");
    assert.ok(proposed[0]?.title.startsWith("design:"));
    assert.ok(proposed[0]?.body.includes("coppergate-design-scout"));
    assert.ok(proposed[0]?.body.includes("raw.githubusercontent.com"));
  });

  it("formats body with acceptance checklist", () => {
    const body = formatDesignIssueBody({
      runId: "abc",
      shot: shot({
        name: "login",
        url: "https://www.coppergate.ai/login",
        path: "/login",
        metrics: {
          client: 1440,
          scrollW: 1500,
          hScroll: true,
          mainW: 900,
          overflowRight: [],
          title: "Login",
        },
      }),
      imageMarkdown: "![login](https://example.com/login.png)",
    });
    assert.ok(body.includes("## Acceptance"));
    assert.ok(body.includes("runId=abc"));
    assert.ok(body.includes("![login]"));
  });

  it("skips auth routes without workspace/auth", () => {
    const publicOnly = resolveDesignScoutRoutes({ hasAuth: false });
    assert.ok(publicOnly.every((r) => !r.requiresAuth));
    assert.ok(publicOnly.some((r) => r.name === "landing"));

    const withAuth = resolveDesignScoutRoutes({
      hasAuth: true,
      workspaceId: "ws-1",
    });
    assert.ok(withAuth.some((r) => r.name === "agents"));
    assert.ok(withAuth.some((r) => r.path === "/workspaces/ws-1/agents"));
  });

  it("proposeDesignOpenRows allocates P-N with fingerprint dedup", () => {
    const md = `
## Product

| Status | ID | Title | Notes |
| --- | --- | --- | --- |
| Done | P-154 | Catalog SoT | ok |
`;
    const shots = [
      shot({
        name: "landing",
        url: "https://www.coppergate.ai/",
        path: "/",
        metrics: {
          client: 1440,
          scrollW: 1600,
          hScroll: true,
          mainW: 1200,
          overflowRight: [],
          title: "Coppergate",
        },
      }),
    ];
    const rows = proposeDesignOpenRows({ markdown: md, shots, max: 2 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, "P-155");
    assert.equal(rows[0]!.fingerprint, designScoutFingerprint("/"));
    assert.match(rows[0]!.notes, /design-scout:fp=/);

    const { content, changed } = appendDesignScoutOpenRowsToMarkdown(md, rows);
    assert.equal(changed, true);
    assert.ok(content.includes(DESIGN_SCOUT_SECTION_HEADING));
    assert.match(content, /\| Open \| P-155 \|/);

    const again = proposeDesignOpenRows({ markdown: content, shots, max: 2 });
    assert.equal(again.length, 0);
  });
});
