import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStubFileContent,
  isStubOrToyDelivery,
  isToyPrTitle,
} from "./stub-detect.js";

describe("stub-detect", () => {
  it("flags coppergateSignalFix bodies and toy titles", () => {
    assert.equal(isStubFileContent("export function coppergateSignalFix() {}"), true);
    assert.equal(isToyPrTitle("Coppergate: Scaffold project structure"), true);
    assert.equal(isToyPrTitle("feat(blog): share card modal"), false);
    const hit = isStubOrToyDelivery({
      title: "Dogfood: tiny README typo 1",
      fileBodies: [{ path: "x.ts", content: "ok enough content here" }],
    });
    assert.equal(hit.toy, true);
  });

  it("flags staging smoke and coppergate run comment stubs", () => {
    assert.equal(
      isStubFileContent(
        'export default function Page() { return <main>Coppergate staging smoke</main>; }',
      ),
      true,
    );
    assert.equal(isStubFileContent("// coppergate run abc-123\n"), true);
    const smoke = isStubOrToyDelivery({
      title: "Ship product page",
      fileBodies: [
        {
          path: "app/page.tsx",
          content:
            "export default function Page() {\n  return <p>Coppergate staging smoke</p>;\n}\n",
        },
      ],
    });
    assert.equal(smoke.toy, true);
    assert.match(smoke.reason ?? "", /stub_file/);
  });

  it("flags empty sandbox delivery", () => {
    const hit = isStubOrToyDelivery({
      title: "P-12: real capability",
      fileBodies: [],
      fromSandbox: 0,
    });
    assert.equal(hit.toy, true);
    assert.equal(hit.reason, "no_sandbox_files");
  });
});
