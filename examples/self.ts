#!/usr/bin/env node

import { JSSchemathesis } from "../src/index.js";
import type { TestSummary } from "../src/types/index.js";

/**
 * Simple self-test example
 */
async function testAPI(): Promise<void> {
  const tester = new JSSchemathesis({
    baseURL: "https://petstore.swagger.io/v2",
    maxTests: 20,
    verbose: true,
  });

  try {
    const report = await tester.runFromSchema(
      "https://petstore.swagger.io/v2/swagger.json"
    );
    console.log(report);

    const summary: TestSummary | null = tester.getSummary();
    console.log("📊 Test Summary:", summary);
  } catch (error) {
    console.error("Error:", (error as Error).message);
  }
}

testAPI();
