import { OpenAPIParser } from "./parser/openapi-parser.js";
import { TestGenerator } from "./generator/test-generator.js";
import { APITester } from "./tester/api-tester.js";
import { Reporter } from "./reporter/reporter.js";
import { FuzzingEngine } from "./fuzzer/fuzzing-engine.js";
import type {
  JSSchemathesisOptions,
  OpenAPISchema,
  TestCase,
  TestResult,
  TestSummary,
  GenerationOptions,
} from "./types/index.js";

/**
 * Main JSSchemathesis class - TypeScript equivalent of Python schemathesis
 * Provides property-based testing for APIs using OpenAPI specifications
 */
export class JSSchemathesis {
  public readonly options: Required<JSSchemathesisOptions>;
  public readonly parser: OpenAPIParser;
  public readonly generator: TestGenerator;
  public readonly tester: APITester;
  public readonly reporter: Reporter;
  public readonly fuzzer: FuzzingEngine;
  private results: TestResult[] = [];

  constructor(options: JSSchemathesisOptions = {}) {
    this.options = {
      baseURL: options.baseURL || "",
      timeout: options.timeout || 10000,
      maxTests: options.maxTests || 100,
      verbose: options.verbose || false,
      headers: options.headers || {},
      auth: options.auth || undefined,
      validateResponses: options.validateResponses !== false,
      fuzzingEnabled: options.fuzzingEnabled !== false,
      propertyTests: options.propertyTests !== false,
      aggressiveness: options.aggressiveness || "medium",
      includeSecurityTests: options.includeSecurityTests !== false,
      includeBoundaryTests: options.includeBoundaryTests !== false,
      includeTypeConfusion: options.includeTypeConfusion !== false,
      maxFuzzTests: options.maxFuzzTests || 50,
      seed: options.seed || Date.now(),
      outputFormat: options.outputFormat || "console",
      outputFile: options.outputFile || undefined,
      includePassedTests: options.includePassedTests !== false,
      includeRequestDetails: options.includeRequestDetails || false,
      followRedirects: options.followRedirects !== false,
      maxRedirects: options.maxRedirects || 5,
      retries: options.retries || 0,
      ...options,
    } as Required<JSSchemathesisOptions>;

    this.parser = new OpenAPIParser();
    this.generator = new TestGenerator(this.options);
    this.tester = new APITester(this.options);
    this.reporter = new Reporter(this.options);
    this.fuzzer = new FuzzingEngine(this.options);
  }

  /**
   * Run tests from an OpenAPI schema file or URL
   */
  async runFromSchema(schemaPath: string): Promise<string> {
    try {
      console.log(`🔍 Parsing OpenAPI schema: ${schemaPath}`);
      const schema = await this.parser.parse(schemaPath);

      console.log(
        `🎯 Found ${Object.keys(schema.paths || {}).length} endpoints`
      );

      // Generate test cases using property-based testing
      const testCases = await this.generator.generateTests(schema);
      console.log(`🧪 Generated ${testCases.length} test cases`);

      // Run the tests
      const results = await this.tester.runTests(testCases, schema);
      this.results = results;

      // Generate and return report
      return this.reporter.generateReport(results);
    } catch (error) {
      throw new Error(`Failed to run tests: ${(error as Error).message}`);
    }
  }

  /**
   * Run tests from a live API endpoint that serves OpenAPI spec
   */
  async runFromURL(
    specURL: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    return this.runFromSchema(specURL);
  }

  /**
   * Run property-based tests on specific endpoints
   */
  async testEndpoint(
    schema: OpenAPISchema,
    path: string,
    method: string,
    options: GenerationOptions = {}
  ): Promise<TestResult[]> {
    const testCases = await this.generator.generateForEndpoint(
      schema,
      path,
      method,
      options
    );
    return await this.tester.runTests(testCases, schema);
  }

  /**
   * Run fuzzing tests specifically
   */
  async fuzzEndpoint(
    schema: OpenAPISchema,
    path: string,
    method: string,
    options: GenerationOptions = {}
  ): Promise<TestResult[]> {
    const fuzzTests = await this.fuzzer.generateFuzzTests(
      schema,
      path,
      method,
      options
    );
    return await this.tester.runTests(fuzzTests, schema);
  }

  /**
   * Get the last test results
   */
  getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Get summary statistics
   */
  getSummary(): TestSummary | null {
    if (!this.results.length) return null;

    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter((r) => r.status === "failed").length;
    const errors = this.results.filter((r) => r.status === "error").length;

    return {
      total: this.results.length,
      passed,
      failed,
      errors,
      passRate: ((passed / this.results.length) * 100).toFixed(2),
    };
  }
}

export default JSSchemathesis;

// Re-export types for convenience
export type {
  JSSchemathesisOptions,
  OpenAPISchema,
  TestCase,
  TestResult,
  TestSummary,
  AuthConfig,
  FuzzStrategy,
  AggressivenessLevel,
  OutputFormat,
} from "./types/index.js";

// Re-export individual classes for advanced usage
export { OpenAPIParser } from "./parser/openapi-parser.js";
export { TestGenerator } from "./generator/test-generator.js";
export { APITester } from "./tester/api-tester.js";
export { Reporter } from "./reporter/reporter.js";
export { FuzzingEngine } from "./fuzzer/fuzzing-engine.js";
