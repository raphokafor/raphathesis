import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import Ajv, { ValidateFunction } from "ajv";
import type {
  OpenAPISchema,
  TestCase,
  TestResult,
  TestResponse,
  ValidationResult,
  ValidationCheck,
  HttpClientConfig,
  JSSchemathesisOptions,
} from "../types/index.js";
import { TestExecutionError } from "../types/index.js";

/**
 * API Test Runner
 * Executes test cases against real APIs and validates responses
 */
export class APITester {
  private readonly options: Required<JSSchemathesisOptions>;
  private readonly ajv: Ajv;
  private readonly client: AxiosInstance;

  constructor(options: JSSchemathesisOptions) {
    this.options = {
      timeout: options.timeout || 10000,
      baseURL: options.baseURL || "",
      headers: options.headers || {},
      auth: options.auth || undefined,
      validateResponses: options.validateResponses !== false,
      followRedirects: options.followRedirects !== false,
      maxRedirects: options.maxRedirects || 5,
      retries: options.retries || 0,
      ...options,
    } as Required<JSSchemathesisOptions>;

    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.client = this.createHttpClient();
  }

  /**
   * Create HTTP client with default configuration
   */
  private createHttpClient(): AxiosInstance {
    const config: AxiosRequestConfig = {
      timeout: this.options.timeout,
      baseURL: this.options.baseURL,
      headers: this.options.headers,
      maxRedirects: this.options.maxRedirects,
      validateStatus: () => true, // Don't throw on any status code
    };

    if (this.options.auth) {
      if (this.options.auth.type === "bearer") {
        config.headers!.Authorization = `Bearer ${this.options.auth.token}`;
      } else if (this.options.auth.type === "basic") {
        config.auth = {
          username: this.options.auth.username!,
          password: this.options.auth.password!,
        };
      }
    }

    return axios.create(config);
  }

  /**
   * Run multiple test cases
   */
  async runTests(
    testCases: TestCase[],
    schema: OpenAPISchema
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const total = testCases.length;

    console.log(`🚀 Running ${total} test cases...`);

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];

      if (this.options.verbose) {
        console.log(
          `📋 [${i + 1}/${total}] ${testCase.method} ${testCase.path}`
        );
      }

      try {
        const result = await this.runSingleTest(testCase, schema);
        results.push(result);

        if (this.options.verbose) {
          const status =
            result.status === "passed"
              ? "✅"
              : result.status === "failed"
              ? "❌"
              : "⚠️";
          console.log(
            `   ${status} ${result.status.toUpperCase()}: ${
              result.message || "OK"
            }`
          );
        }
      } catch (error) {
        const result: TestResult = {
          id: testCase.id,
          testCase,
          status: "error",
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        };
        results.push(result);

        if (this.options.verbose) {
          console.log(`   ⚠️ ERROR: ${(error as Error).message}`);
        }
      }

      // Small delay to avoid overwhelming the API
      if (i < testCases.length - 1) {
        await this.delay(50);
      }
    }

    return results;
  }

  /**
   * Run a single test case
   */
  async runSingleTest(
    testCase: TestCase,
    schema: OpenAPISchema
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Build request
      const request = this.buildRequest(testCase);

      // Execute request
      const response = await this.executeRequest(request);

      // Validate response
      const validation = this.validateResponse(response, testCase, schema);

      const duration = Date.now() - startTime;

      return {
        id: testCase.id,
        testCase,
        request,
        response: this.sanitizeResponse(response),
        validation,
        status: validation.valid ? "passed" : "failed",
        message: validation.message,
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      throw new TestExecutionError(
        `Test execution failed: ${(error as Error).message}`,
        testCase,
        error as Error
      );
    }
  }

  /**
   * Build HTTP request from test case
   */
  private buildRequest(testCase: TestCase): AxiosRequestConfig {
    const { path, method, parameters, requestBody, headers } = testCase;

    // Build URL with path parameters
    let url = path;
    if (parameters?.path) {
      for (const [key, value] of Object.entries(parameters.path)) {
        url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
      }
    }

    // Build request config
    const config: AxiosRequestConfig = {
      method: method.toLowerCase() as any,
      url,
      headers: { ...headers },
      params: parameters?.query || {},
    };

    // Add request body
    if (requestBody && ["post", "put", "patch"].includes(config.method!)) {
      config.data = requestBody.data;
      if (requestBody.contentType) {
        config.headers!["Content-Type"] = requestBody.contentType;
      }
    }

    // Add header parameters
    if (parameters?.header) {
      Object.assign(config.headers!, parameters.header);
    }

    return config;
  }

  /**
   * Execute HTTP request with retries
   */
  private async executeRequest(
    request: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await this.client.request(request);
        return response;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.options.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Validate response against expectations
   */
  private validateResponse(
    response: AxiosResponse,
    testCase: TestCase,
    schema: OpenAPISchema
  ): ValidationResult {
    const validations: ValidationCheck[] = [];
    let valid = true;

    // Check status code expectations
    const statusValidation = this.validateStatusCode(response, testCase);
    validations.push(statusValidation);
    if (!statusValidation.valid) valid = false;

    // Validate response schema if available
    if (this.options.validateResponses && schema) {
      const schemaValidation = this.validateResponseSchema(
        response,
        testCase,
        schema
      );
      validations.push(schemaValidation);
      if (!schemaValidation.valid) valid = false;
    }

    // Validate headers
    const headerValidation = this.validateResponseHeaders(response, testCase);
    validations.push(headerValidation);
    if (!headerValidation.valid) valid = false;

    const message =
      validations
        .filter((v) => !v.valid)
        .map((v) => v.message)
        .join("; ") || "All validations passed";

    return {
      valid,
      message,
      validations,
    };
  }

  /**
   * Validate HTTP status code
   */
  private validateStatusCode(
    response: AxiosResponse,
    testCase: TestCase
  ): ValidationCheck {
    const status = response.status;
    const { expectedOutcome } = testCase;

    let expectedStatuses: number[] = [];

    switch (expectedOutcome) {
      case "success":
        expectedStatuses = [200, 201, 202, 204];
        break;
      case "client_error":
        expectedStatuses = [400, 401, 403, 404, 422];
        break;
      case "server_error":
        expectedStatuses = [500, 501, 502, 503];
        break;
      default:
        // For specific expected status
        if (typeof expectedOutcome === "number") {
          expectedStatuses = [expectedOutcome];
        } else {
          expectedStatuses = [200, 201, 202, 204];
        }
    }

    const valid = expectedStatuses.includes(status);

    return {
      type: "status_code",
      valid,
      message: valid
        ? `Status ${status} is expected`
        : `Status ${status} not in expected range ${expectedStatuses.join(
            ", "
          )}`,
    };
  }

  /**
   * Validate response against OpenAPI schema
   */
  private validateResponseSchema(
    response: AxiosResponse,
    testCase: TestCase,
    schema: OpenAPISchema
  ): ValidationCheck {
    try {
      const operation = testCase.operation;
      const status = response.status.toString();

      if (
        !(operation as any).responses ||
        !(operation as any).responses[status]
      ) {
        // Check for default response
        if (!(operation as any).responses.default) {
          return {
            type: "schema",
            valid: true,
            message: "No schema defined for this response",
          };
        }
      }

      const responseSpec =
        (operation as any).responses[status] ||
        (operation as any).responses.default;
      if (!responseSpec || !responseSpec.content) {
        return {
          type: "schema",
          valid: true,
          message: "No content schema defined",
        };
      }

      const contentType =
        response.headers["content-type"] || "application/json";
      const mediaType = this.findMatchingMediaType(
        responseSpec.content,
        contentType
      );

      if (!mediaType || !mediaType.schema) {
        return {
          type: "schema",
          valid: true,
          message: "No schema for response content type",
        };
      }

      // Validate response data against schema
      const validate: ValidateFunction = this.ajv.compile(mediaType.schema);
      const valid = validate(response.data);

      return {
        type: "schema",
        valid,
        message: valid
          ? "Response schema valid"
          : `Schema validation failed: ${this.ajv.errorsText(validate.errors)}`,
      };
    } catch (error) {
      return {
        type: "schema",
        valid: false,
        message: `Schema validation error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Validate response headers
   */
  private validateResponseHeaders(
    response: AxiosResponse,
    testCase: TestCase
  ): ValidationCheck {
    // Basic header validation
    const headers = response.headers;

    // Check if response has content-type when there's content
    if (
      response.data &&
      typeof response.data === "object" &&
      !headers["content-type"]
    ) {
      return {
        type: "headers",
        valid: false,
        message: "Missing Content-Type header for response with content",
      };
    }

    return {
      type: "headers",
      valid: true,
      message: "Headers valid",
    };
  }

  /**
   * Find matching media type from content spec
   */
  private findMatchingMediaType(
    content: Record<string, any>,
    contentType: string
  ): any {
    // Exact match
    if (content[contentType]) {
      return content[contentType];
    }

    // Partial match (e.g., 'application/json' matches 'application/json; charset=utf-8')
    const baseType = contentType.split(";")[0].trim();
    if (content[baseType]) {
      return content[baseType];
    }

    // Wildcard match
    const mainType = baseType.split("/")[0];
    for (const [type, spec] of Object.entries(content)) {
      if (type === `${mainType}/*` || type === "*/*") {
        return spec;
      }
    }

    return null;
  }

  /**
   * Sanitize response for logging (remove sensitive data)
   */
  private sanitizeResponse(response: AxiosResponse): TestResponse {
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      data: this.truncateData(response.data),
      size: JSON.stringify(response.data || "").length,
    };
  }

  /**
   * Truncate large response data for logging
   */
  private truncateData(data: any): any {
    const str = JSON.stringify(data);
    if (str.length > 1000) {
      return JSON.parse(str.substring(0, 1000)) + "... (truncated)";
    }
    return data;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default APITester;
