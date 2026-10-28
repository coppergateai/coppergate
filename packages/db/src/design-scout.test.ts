import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDesignIssueBody,
  proposeDesignIssues,
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
});
