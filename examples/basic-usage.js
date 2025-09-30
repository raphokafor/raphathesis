#!/usr/bin/env node

import { JSSchemathesis } from "../src/index.js";

/**
 * Basic usage example of JS-Schemathesis
 * This demonstrates how to use the framework programmatically
 */

async function basicExample() {
  console.log("🧪 JS-Schemathesis Basic Usage Example\n");

  try {
    // Create a new instance
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      timeout: 5000,
      verbose: true,
      validateResponses: true,
      fuzzingEnabled: true,
    });

    // Test with the Petstore API
    console.log("Testing Petstore API...");
    const report = await tester.runFromSchema(
      "https://petstore.swagger.io/v2/swagger.json"
    );

    console.log("\n" + report);

    // Get summary
    const summary = tester.getSummary();
    console.log("📊 Test Summary:", summary);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function customEndpointExample() {
  console.log("\n🎯 Testing Specific Endpoint Example\n");

  try {
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      verbose: true,
    });

    // Parse the schema first
    const schema = await tester.parser.parse(
      "https://petstore.swagger.io/v2/swagger.json"
    );

    // Test a specific endpoint
    const results = await tester.testEndpoint(
      schema,
      "/pet/findByStatus",
      "get"
    );

    console.log(
      `✅ Tested specific endpoint with ${results.length} test cases`
    );

    // Show results
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    console.log(`Results: ${passed} passed, ${failed} failed`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function fuzzingExample() {
  console.log("\n🔀 Fuzzing Example\n");

  try {
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      aggressiveness: "high",
      verbose: false,
    });

    // Parse schema
    const schema = await tester.parser.parse(
      "https://petstore.swagger.io/v2/swagger.json"
    );

    // Run fuzzing tests on POST /pet endpoint
    console.log("Running fuzzing tests on POST /pet...");
    const fuzzResults = await tester.fuzzEndpoint(schema, "/pet", "post");

    console.log(`🔀 Completed ${fuzzResults.length} fuzz tests`);

    // Analyze results
    const strategies = {};
    for (const result of fuzzResults) {
      const strategy = result.testCase.strategy || "unknown";
      strategies[strategy] = (strategies[strategy] || 0) + 1;
    }

    console.log("Strategies tested:", strategies);

    // Show any interesting findings
    const serverErrors = fuzzResults.filter(
      (r) => r.response && r.response.status >= 500
    );
    if (serverErrors.length > 0) {
      console.log(
        `⚠️  Found ${serverErrors.length} requests that caused server errors`
      );
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Run examples
async function main() {
  await basicExample();
  await customEndpointExample();
  await fuzzingExample();

  console.log("\n🎉 Examples completed!");
}

main().catch(console.error);
