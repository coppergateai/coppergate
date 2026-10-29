import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROFILE_SKILL_KEYS,
  SYSTEM_SKILL_SEEDS,
  parseSkillKeysJson,
} from "./skills.js";

describe("system skills (self-pilot roles)", () => {
  it("includes role-prompt skill keys", () => {
    const keys = new Set(SYSTEM_SKILL_SEEDS.map((s) => s.key));
    for (const k of [
      "product-cpo",
      "designer-ux",
      "landing-cro",
      "seo-growth",
      "qa-explore",
      "design-audit",
      "security-asvs",
      "agent-reliability",
      "open-program",
    ]) {
      assert.ok(keys.has(k), `missing skill ${k}`);
    }
  });

  it("keeps skill bodies under prompt budget per seed", () => {
    for (const s of SYSTEM_SKILL_SEEDS) {
      assert.ok(s.bodyMarkdown.length > 40, s.key);
      assert.ok(
        s.bodyMarkdown.length <= 4_000,
        `${s.key} too long (${s.bodyMarkdown.length})`,
      );
    }
  });

  it("wires role skills onto bounded profiles", () => {
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.proposer?.includes("product-cpo"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.proposer?.includes("open-program"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.release?.includes("open-program"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.triager?.includes("open-program"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.engineer?.includes("designer-ux"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.engineer?.includes("landing-cro"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.docs?.includes("seo-growth"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.qa?.includes("qa-explore"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.qa?.includes("design-audit"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.security?.includes("security-asvs"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.fixer?.includes("agent-reliability"));
    assert.ok(DEFAULT_PROFILE_SKILL_KEYS.reviewer?.includes("agent-reliability"));
  });

  it("caps profile skill lists for prompt load (≤4)", () => {
    for (const [profile, keys] of Object.entries(DEFAULT_PROFILE_SKILL_KEYS)) {
      assert.ok(keys.length <= 4, `${profile} has ${keys.length} skills`);
    }
  });

  it("parseSkillKeysJson tolerates junk", () => {
    assert.deepEqual(parseSkillKeysJson(null), []);
    assert.deepEqual(parseSkillKeysJson("[]"), []);
    assert.deepEqual(parseSkillKeysJson('["a","b"]'), ["a", "b"]);
  });
});
