import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

class SummaryReporter implements Reporter {
  onBegin(_config: FullConfig, _suite: Suite): void {
    // no-op
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const mark = result.status === "passed" ? "✓" : "✗";
    console.log(`${mark} ${test.title} (${result.status})`);
  }

  onEnd(result: FullResult): void {
    const md = resolve(import.meta.dirname, "../.auth/last-check.md");
    if (existsSync(md)) {
      console.log("\n—— last-check.md ——\n");
      console.log(readFileSync(md, "utf8"));
    }
    console.log(`e2e finished: ${result.status}`);
  }
}

export default SummaryReporter;
