#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { JSSchemathesis } from "./index.js";
import type { AuthConfig, CLIOptions } from "./types/index.js";

const program = new Command();

program
  .name("js-schemathesis")
  .description("Property-based API testing framework for TypeScript/JavaScript")
  .version("1.0.0");

program
  .command("run")
  .description("Run tests against an API using OpenAPI schema")
  .argument("<schema>", "Path to OpenAPI schema file or URL")
  .option("-b, --base-url <url>", "Base URL for the API")
  .option(
    "-H, --header <header>",
    'Add custom header (format: "key:value")',
    []
  )
  .option(
    "-a, --auth <type:value>",
    "Authentication (bearer:token or basic:user:pass)"
  )
  .option("-t, --timeout <ms>", "Request timeout in milliseconds", "10000")
  .option(
    "-m, --max-tests <num>",
    "Maximum number of tests per endpoint",
    "100"
  )
  .option("-o, --output <file>", "Output report to file")
  .option(
    "-f, --format <format>",
    "Output format (console, json, html)",
    "console"
  )
  .option("-v, --verbose", "Verbose output")
  .option("--no-fuzzing", "Disable fuzzing tests")
  .option("--no-property-tests", "Disable property-based tests")
  .option("--no-response-validation", "Disable response schema validation")
  .option(
    "--aggressiveness <level>",
    "Fuzzing aggressiveness (low, medium, high)",
    "medium"
  )
  .option("--seed <number>", "Random seed for reproducible tests")
  .action(async (schema: string, options: CLIOptions) => {
    try {
      console.log(
        chalk.blue.bold("🧪 JS-Schemathesis - Property-based API Testing\n")
      );

      // Parse headers
      const headers: Record<string, string> = {};
      for (const header of options.header) {
        const [key, ...valueParts] = header.split(":");
        if (key && valueParts.length > 0) {
          headers[key.trim()] = valueParts.join(":").trim();
        }
      }

      // Parse authentication
      let auth: AuthConfig | undefined = undefined;
      if (options.auth) {
        const [type, ...valueParts] = options.auth.split(":");
        const value = valueParts.join(":");

        if (type === "bearer") {
          auth = { type: "bearer", token: value };
        } else if (type === "basic") {
          const [username, password] = value.split(":");
          auth = { type: "basic", username, password };
        }
      }

      // Create tester instance
      const tester = new JSSchemathesis({
        baseURL: options.baseUrl,
        headers,
        auth,
        timeout: parseInt(options.timeout),
        maxTests: options.maxTests ? parseInt(options.maxTests) : undefined,
        verbose: options.verbose,
        fuzzingEnabled: options.fuzzing,
        propertyTests: options.propertyTests,
        validateResponses: options.responseValidation,
        aggressiveness: options.aggressiveness as "low" | "medium" | "high",
        seed: options.seed ? parseInt(options.seed) : undefined,
        outputFormat: options.format as "console" | "json" | "html",
        outputFile: options.output,
      });

      // Run tests
      const report = await tester.runFromSchema(schema);

      // Output report
      if (options.format === "console" || !options.output) {
        console.log(report);
      }

      if (options.output) {
        const fs = await import("fs/promises");
        await fs.writeFile(options.output, report, "utf-8");
        console.log(chalk.green(`📄 Report saved to ${options.output}`));
      }

      // Exit with appropriate code
      const summary = tester.getSummary();
      if (summary && (summary.failed > 0 || summary.errors > 0)) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Error: ${(error as Error).message}`));
      if (options.verbose) {
        console.error((error as Error).stack);
      }
      process.exit(1);
    }
  });

program
  .command("fuzz")
  .description("Run only fuzzing tests against specific endpoint")
  .argument("<schema>", "Path to OpenAPI schema file or URL")
  .argument("<path>", "API path to test (e.g., /users/{id})")
  .argument("<method>", "HTTP method (GET, POST, PUT, DELETE)")
  .option("-b, --base-url <url>", "Base URL for the API")
  .option(
    "-H, --header <header>",
    'Add custom header (format: "key:value")',
    []
  )
  .option(
    "-a, --auth <type:value>",
    "Authentication (bearer:token or basic:user:pass)"
  )
  .option("-t, --timeout <ms>", "Request timeout in milliseconds", "10000")
  .option("-n, --num-tests <num>", "Number of fuzz tests to run", "50")
  .option("-o, --output <file>", "Output report to file")
  .option(
    "-f, --format <format>",
    "Output format (console, json, html)",
    "console"
  )
  .option("-v, --verbose", "Verbose output")
  .option(
    "--aggressiveness <level>",
    "Fuzzing aggressiveness (low, medium, high)",
    "medium"
  )
  .action(
    async (
      schema: string,
      path: string,
      method: string,
      options: CLIOptions
    ) => {
      try {
        console.log(chalk.blue.bold("🔀 JS-Schemathesis - Fuzzing Mode\n"));
        console.log(
          `Target: ${chalk.cyan(method.toUpperCase())} ${chalk.cyan(path)}\n`
        );

        // Parse headers
        const headers: Record<string, string> = {};
        for (const header of options.header) {
          const [key, ...valueParts] = header.split(":");
          if (key && valueParts.length > 0) {
            headers[key.trim()] = valueParts.join(":").trim();
          }
        }

        // Parse authentication
        let auth: AuthConfig | undefined = undefined;
        if (options.auth) {
          const [type, ...valueParts] = options.auth.split(":");
          const value = valueParts.join(":");

          if (type === "bearer") {
            auth = { type: "bearer", token: value };
          } else if (type === "basic") {
            const [username, password] = value.split(":");
            auth = { type: "basic", username, password };
          }
        }

        // Create tester instance
        const tester = new JSSchemathesis({
          baseURL: options.baseUrl,
          headers,
          auth,
          timeout: parseInt(options.timeout),
          verbose: options.verbose,
          aggressiveness: options.aggressiveness as "low" | "medium" | "high",
          outputFormat: options.format as "console" | "json" | "html",
          outputFile: options.output,
        });

        // Parse schema
        const parsedSchema = await tester.parser.parse(schema);

        // Run fuzz tests
        const results = await tester.fuzzEndpoint(
          parsedSchema,
          path,
          method.toLowerCase(),
          {
            maxTests: options.numTests ? parseInt(options.numTests) : undefined,
          }
        );

        // Generate report
        const report = await tester.reporter.generateReport(results);

        // Output report
        if (options.format === "console" || !options.output) {
          console.log(report);
        }

        if (options.output) {
          const fs = await import("fs/promises");
          await fs.writeFile(options.output, report, "utf-8");
          console.log(chalk.green(`📄 Report saved to ${options.output}`));
        }
      } catch (error) {
        console.error(chalk.red(`❌ Error: ${(error as Error).message}`));
        if (options.verbose) {
          console.error((error as Error).stack);
        }
        process.exit(1);
      }
    }
  );

program
  .command("validate")
  .description("Validate OpenAPI schema without running tests")
  .argument("<schema>", "Path to OpenAPI schema file or URL")
  .option("-v, --verbose", "Verbose output")
  .action(async (schema: string, options: { verbose?: boolean }) => {
    try {
      console.log(chalk.blue.bold("📋 JS-Schemathesis - Schema Validation\n"));

      const tester = new JSSchemathesis({ verbose: options.verbose });
      const parsedSchema = await tester.parser.parse(schema);

      console.log(chalk.green("✅ Schema is valid!"));
      console.log(
        `📊 Found ${Object.keys(parsedSchema.paths || {}).length} paths`
      );

      const endpoints = tester.parser.getEndpoints(parsedSchema);
      console.log(`🎯 Found ${endpoints.length} endpoints:`);

      for (const endpoint of endpoints) {
        console.log(
          `  ${chalk.cyan(endpoint.method)} ${chalk.gray(endpoint.path)}`
        );
      }
    } catch (error) {
      console.error(
        chalk.red(`❌ Schema validation failed: ${(error as Error).message}`)
      );
      if (options.verbose) {
        console.error((error as Error).stack);
      }
      process.exit(1);
    }
  });

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error(
    chalk.red("Unhandled Rejection at:", promise, "reason:", reason)
  );
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error(chalk.red("Uncaught Exception:", error));
  process.exit(1);
});

program.parse();
