#!/usr/bin/env node

import { JSSchemathesis } from "../src/index.js";
import fs from "fs/promises";
import type {
  TestResult,
  TestSummary,
  OpenAPISchema,
} from "../src/types/index.js";

/**
 * Advanced usage examples showing more sophisticated testing scenarios
 */

async function authenticationExample(): Promise<void> {
  console.log("🔐 Authentication Example\n");

  try {
    // Example with Bearer token authentication
    const tester = new JSSchemathesis({
      baseURL: "https://api.example.com",
      auth: {
        type: "bearer",
        token: "your-api-token-here",
      },
      headers: {
        "X-API-Version": "v1",
        Accept: "application/json",
      },
      maxTests: 30,
    });

    console.log("✅ Configured with Bearer token authentication");
    console.log(
      "Note: Replace with actual API endpoint and token for real testing"
    );
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
  }
}

async function customValidationExample(): Promise<void> {
  console.log("\n🔍 Custom Validation Example\n");

  try {
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      validateResponses: true,
      verbose: true,
    });

    // Custom test with additional validation
    const schema = await tester.parser.parse(
      "https://petstore.swagger.io/v2/swagger.json"
    );
    const results: TestResult[] = await tester.testEndpoint(
      schema,
      "/store/inventory",
      "get"
    );

    // Custom analysis of results
    for (const result of results) {
      if (result.status === "passed" && result.response) {
        // Custom validation logic
        if (result.response.status === 200) {
          const data = result.response.data;
          if (typeof data === "object" && data !== null) {
            console.log(
              "✅ Inventory endpoint returned valid object structure"
            );
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
  }
}

async function performanceTestingExample(): Promise<void> {
  console.log("\n⚡ Performance Testing Example\n");

  try {
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      timeout: 3000, // 3 second timeout
      maxTests: 50,
    });

    const startTime = Date.now();
    const report = await tester.runFromSchema(
      "https://petstore.swagger.io/v2/swagger.json"
    );
    const totalTime = Date.now() - startTime;

    console.log(`⏱️  Total test execution time: ${totalTime}ms`);

    const summary = tester.getSummary();
    if (summary) {
      console.log(`📊 Average request time: ${summary.averageDuration}ms`);
      console.log(
        `🎯 Tests per second: ${(summary.total / (totalTime / 1000)).toFixed(
          2
        )}`
      );
    }
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
  }
}

interface APIConfig {
  name: string;
  schema: string;
  baseURL: string;
}

interface BatchResult {
  api: string;
  summary?: TestSummary;
  error?: string;
  timestamp: string;
}

async function batchTestingExample(): Promise<void> {
  console.log("\n📦 Batch Testing Example\n");

  const apis: APIConfig[] = [
    {
      name: "Petstore API",
      schema: "https://petstore.swagger.io/v2/swagger.json",
      baseURL: "https://petstore.swagger.io/v2",
    },
    // Add more APIs here
  ];

  const results: BatchResult[] = [];

  for (const api of apis) {
    try {
      console.log(`Testing ${api.name}...`);

      const tester = new JSSchemathesis({
        baseURL: api.baseURL,
        maxTests: 20,
        verbose: false,
      });

      const report = await tester.runFromSchema(api.schema);
      const summary = tester.getSummary();

      results.push({
        api: api.name,
        summary: summary || undefined,
        timestamp: new Date().toISOString(),
      });

      console.log(`✅ ${api.name}: ${summary?.passRate}% pass rate`);
    } catch (error) {
      console.error(
        `❌ Failed to test ${api.name}: ${(error as Error).message}`
      );
      results.push({
        api: api.name,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Save batch results
  await fs.writeFile(
    "batch-test-results.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );

  console.log("📄 Batch results saved to batch-test-results.json");
}

async function securityTestingExample(): Promise<void> {
  console.log("\n🔒 Security Testing Example\n");

  try {
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      aggressiveness: "high",
      includeSecurityTests: true,
      maxTests: 25,
    });

    // Focus on security-related endpoints
    const schema: OpenAPISchema = await tester.parser.parse(
      "https://petstore.swagger.io/v2/swagger.json"
    );

    // Test endpoints that might be security-sensitive
    const securityEndpoints = [
      { path: "/user/login", method: "get" },
      { path: "/user", method: "post" },
      { path: "/pet", method: "post" },
    ];

    const allResults: TestResult[] = [];

    for (const endpoint of securityEndpoints) {
      console.log(
        `🔀 Fuzzing ${endpoint.method.toUpperCase()} ${endpoint.path}...`
      );

      const results: TestResult[] = await tester.fuzzEndpoint(
        schema,
        endpoint.path,
        endpoint.method,
        { maxTests: 10 }
      );

      allResults.push(...results);

      // Look for security issues
      const injectionTests = results.filter(
        (r) => r.testCase.strategy === "injection"
      );
      const serverErrors = results.filter(
        (r) => r.response && r.response.status >= 500
      );

      if (injectionTests.length > 0) {
        console.log(`  💉 Tested ${injectionTests.length} injection payloads`);
      }

      if (serverErrors.length > 0) {
        console.log(
          `  ⚠️  ${serverErrors.length} requests caused server errors`
        );
      }
    }

    // Generate security report
    const report = await tester.reporter.generateReport(allResults);
    console.log("\n📋 Security Test Summary:");

    // Extract security findings from report
    const securitySection = report.match(
      /🔒 Security Issues Found:[\s\S]*?(?=\n\n|\n$|$)/
    );
    if (securitySection) {
      console.log(securitySection[0]);
    } else {
      console.log("✅ No obvious security issues detected");
    }
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
  }
}

async function customReportingExample(): Promise<void> {
  console.log("\n📊 Custom Reporting Example\n");

  try {
    const tester = new JSSchemathesis({
      baseURL: "https://petstore.swagger.io/v2",
      maxTests: 15,
      outputFormat: "json",
    });

    const report = await tester.runFromSchema(
      "https://petstore.swagger.io/v2/swagger.json"
    );

    // Parse JSON report for custom analysis
    const reportData = JSON.parse(report);

    // Custom metrics
    const endpointCoverage = reportData.coverage.endpoints;
    const methodsCovered = reportData.coverage.methods;
    const statusCodes = reportData.coverage.statusCodes;

    console.log("📈 Custom Metrics:");
    console.log(`  Endpoints tested: ${endpointCoverage}`);
    console.log(`  HTTP methods: ${methodsCovered.join(", ")}`);
    console.log(`  Status codes seen: ${statusCodes.join(", ")}`);

    // Generate HTML report
    tester.options.outputFormat = "html";
    const htmlReport = await tester.reporter.generateReport(reportData.results);

    await fs.writeFile("test-report.html", htmlReport, "utf-8");
    console.log("📄 HTML report saved to test-report.html");
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
  }
}

// Run all advanced examples
async function main(): Promise<void> {
  await authenticationExample();
  await customValidationExample();
  await performanceTestingExample();
  await batchTestingExample();
  await securityTestingExample();
  await customReportingExample();

  console.log("\n🎉 Advanced examples completed!");
}

main().catch(console.error);
