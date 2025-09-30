import axios from "axios";
import Ajv from "ajv";

/**
 * API Test Runner
 * Executes test cases against real APIs and validates responses
 */
export class APITester {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 10000,
      baseURL: options.baseURL || "",
      headers: options.headers || {},
      auth: options.auth || null,
      validateResponses: options.validateResponses !== false,
      followRedirects: options.followRedirects !== false,
      maxRedirects: options.maxRedirects || 5,
      retries: options.retries || 0,
      ...options,
    };

    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.client = this.createHttpClient();
  }

  /**
   * Create HTTP client with default configuration
   */
  createHttpClient() {
    const config = {
      timeout: this.options.timeout,
      baseURL: this.options.baseURL,
      headers: this.options.headers,
      maxRedirects: this.options.maxRedirects,
      validateStatus: () => true, // Don't throw on any status code
    };

    if (this.options.auth) {
      if (this.options.auth.type === "bearer") {
        config.headers.Authorization = `Bearer ${this.options.auth.token}`;
      } else if (this.options.auth.type === "basic") {
        config.auth = {
          username: this.options.auth.username,
          password: this.options.auth.password,
        };
      }
    }

    return axios.create(config);
  }

  /**
   * Run multiple test cases
   */
  async runTests(testCases, schema) {
    const results = [];
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
        const result = {
          id: testCase.id,
          testCase,
          status: "error",
          error: error.message,
          timestamp: new Date().toISOString(),
        };
        results.push(result);

        if (this.options.verbose) {
          console.log(`   ⚠️ ERROR: ${error.message}`);
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
  async runSingleTest(testCase, schema) {
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

      return {
        id: testCase.id,
        testCase,
        status: "error",
        error: error.message,
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Build HTTP request from test case
   */
  buildRequest(testCase) {
    const { path, method, parameters, requestBody, headers } = testCase;

    // Build URL with path parameters
    let url = path;
    if (parameters?.path) {
      for (const [key, value] of Object.entries(parameters.path)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    // Build request config
    const config = {
      method: method.toLowerCase(),
      url,
      headers: { ...headers },
      params: parameters?.query || {},
    };

    // Add request body
    if (requestBody && ["post", "put", "patch"].includes(config.method)) {
      config.data = requestBody.data;
      if (requestBody.contentType) {
        config.headers["Content-Type"] = requestBody.contentType;
      }
    }

    // Add header parameters
    if (parameters?.header) {
      Object.assign(config.headers, parameters.header);
    }

    return config;
  }

  /**
   * Execute HTTP request with retries
   */
  async executeRequest(request) {
    let lastError;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await this.client.request(request);
        return response;
      } catch (error) {
        lastError = error;

        if (attempt < this.options.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.delay(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Validate response against expectations
   */
  validateResponse(response, testCase, schema) {
    const validations = [];
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
  validateStatusCode(response, testCase) {
    const status = response.status;
    const { expectedOutcome } = testCase;

    let expectedStatuses = [];

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
  validateResponseSchema(response, testCase, schema) {
    try {
      const operation = testCase.operation;
      const status = response.status.toString();

      if (!operation.responses || !operation.responses[status]) {
        // Check for default response
        if (!operation.responses.default) {
          return {
            type: "schema",
            valid: true,
            message: "No schema defined for this response",
          };
        }
      }

      const responseSpec =
        operation.responses[status] || operation.responses.default;
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
      const validate = this.ajv.compile(mediaType.schema);
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
        message: `Schema validation error: ${error.message}`,
      };
    }
  }

  /**
   * Validate response headers
   */
  validateResponseHeaders(response, testCase) {
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
  findMatchingMediaType(content, contentType) {
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
  sanitizeResponse(response) {
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: this.truncateData(response.data),
      size: JSON.stringify(response.data || "").length,
    };
  }

  /**
   * Truncate large response data for logging
   */
  truncateData(data) {
    const str = JSON.stringify(data);
    if (str.length > 1000) {
      return JSON.parse(str.substring(0, 1000)) + "... (truncated)";
    }
    return data;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default APITester;
