import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  PUBLIC_STATIC_ROUTES,
  ROBOTS_DISALLOW,
  SITE_TITLE,
  absoluteUrl,
  robotsHost,
} from "./seo";

describe("seo helpers", () => {
  it("builds absolute URLs without double slashes", () => {
    assert.equal(absoluteUrl("/"), "https://www.coppergate.ai");
    assert.equal(absoluteUrl("/docs"), "https://www.coppergate.ai/docs");
  });

  it("exposes hostname-only robots host", () => {
    assert.equal(robotsHost(), "www.coppergate.ai");
    assert.doesNotMatch(robotsHost(), /^https?:/);
  });

  it("lists the public static marketing surface", () => {
    const paths = PUBLIC_STATIC_ROUTES.map((r) => r.url);
    for (const required of [
      "/",
      "/blog",
      "/docs",
      "/docs/pricing",
      "/security",
      "/changelog",
      "/privacy",
      "/terms",
    ]) {
      assert.ok(paths.includes(required), `missing ${required}`);
    }
    assert.ok(!paths.includes("/login"));
    assert.ok(!paths.includes("/workspaces"));
  });
});

describe("robots route", () => {
  it("disallows app/auth surfaces including /workspaces without slash", () => {
    const body = robots();
    const rule = Array.isArray(body.rules) ? body.rules[0] : body.rules;
    assert.ok(rule);
    const disallow = rule.disallow ?? [];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    for (const path of ROBOTS_DISALLOW) {
      assert.ok(list.includes(path), `robots missing disallow ${path}`);
    }
    assert.equal(body.host, "www.coppergate.ai");
    assert.equal(body.sitemap, "https://www.coppergate.ai/sitemap.xml");
  });
});

describe("sitemap route", () => {
  it("includes static public URLs and published blog posts", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    assert.ok(urls.includes("https://www.coppergate.ai"));
    assert.ok(urls.includes("https://www.coppergate.ai/docs"));
    assert.ok(
      urls.some((u) => u.startsWith("https://www.coppergate.ai/blog/")),
    );
    assert.ok(!urls.some((u) => u.includes("/login")));
    assert.ok(!urls.some((u) => u.includes("/workspaces")));
  });
});

describe("integration logos", () => {
  it("does not emit SVG title tags that can poison document title", () => {
    const srcPath = path.join(
      process.cwd(),
      "src/components/marketing/integration-logos.tsx",
    );
    const src = readFileSync(srcPath, "utf8");
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /<title[\s>]/);
    assert.match(code, /aria-hidden="true"/);
  });

  it("keeps the site title free of integration brand names", () => {
    assert.doesNotMatch(SITE_TITLE, /GitHub|GitLab|Sonar/i);
  });
});
