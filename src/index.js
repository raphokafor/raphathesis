import { OpenAPIParser } from "./parser/openapi-parser.js";
import { TestGenerator } from "./generator/test-generator.js";
import { APITester } from "./tester/api-tester.js";
import { Reporter } from "./reporter/reporter.js";
import { FuzzingEngine } from "./fuzzer/fuzzing-engine.js";

/**
 * Main JSSchemathesis class - JavaScript equivalent of Python schemathesis
 * Provides property-based testing for APIs using OpenAPI specifications
 */
export class JSSchemathesis {
  constructor(options = {}) {
    this.options = {
      baseURL: options.baseURL || "",
      timeout: options.timeout || 10000,
      maxTests: options.maxTests || 100,
      verbose: options.verbose || false,
      headers: options.headers || {},
      auth: options.auth || null,
      validateResponses: options.validateResponses !== false,
      fuzzingEnabled: options.fuzzingEnabled !== false,
      propertyTests: options.propertyTests !== false,
      ...options,
    };

    this.parser = new OpenAPIParser();
    this.generator = new TestGenerator(this.options);
    this.tester = new APITester(this.options);
    this.reporter = new Reporter(this.options);
    this.fuzzer = new FuzzingEngine(this.options);

    this.results = [];
  }

  /**
   * Run tests from an OpenAPI schema file or URL
   */
  async runFromSchema(schemaPath) {
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
      throw new Error(`Failed to run tests: ${error.message}`);
    }
  }

  /**
   * Run tests from a live API endpoint that serves OpenAPI spec
   */
  async runFromURL(specURL, options = {}) {
    return this.runFromSchema(specURL);
  }

  /**
   * Run property-based tests on specific endpoints
   */
  async testEndpoint(schema, path, method, options = {}) {
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
  async fuzzEndpoint(schema, path, method, options = {}) {
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
  getResults() {
    return this.results;
  }

  /**
   * Get summary statistics
   */
  getSummary() {
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
