import fc from "fast-check";
import type { OpenAPIV3 } from "openapi-types";
import type {
  OpenAPISchema,
  TestCase,
  TestParameters,
  RequestBody,
  GenerationOptions,
  JSONSchema,
  ParameterObject,
  JSSchemathesisOptions,
} from "../types/index.js";

/**
 * Property-based test generator
 * Generates comprehensive test cases from OpenAPI schemas using fast-check
 */
export class TestGenerator {
  private readonly options: Required<JSSchemathesisOptions>;

  constructor(options: JSSchemathesisOptions) {
    this.options = {
      maxTests: options.maxTests || 100,
      seed: options.seed || Date.now(),
      verbose: options.verbose || false,
      includeEdgeCases: options.includeEdgeCases !== false,
      generateInvalidData: options.generateInvalidData !== false,
      ...options,
    } as Required<JSSchemathesisOptions>;
  }

  /**
   * Generate test cases for all endpoints in schema
   */
  async generateTests(schema: OpenAPISchema): Promise<TestCase[]> {
    const testCases: TestCase[] = [];

    for (const [path, pathItem] of Object.entries(schema.paths || {})) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation === "object" && (operation as any).responses) {
          const endpointTests = await this.generateForEndpoint(
            schema,
            path,
            method
          );
          testCases.push(...endpointTests);
        }
      }
    }

    return testCases;
  }

  /**
   * Generate test cases for a specific endpoint
   */
  async generateForEndpoint(
    schema: OpenAPISchema,
    path: string,
    method: string,
    options: GenerationOptions = {}
  ): Promise<TestCase[]> {
    const pathItem = schema.paths?.[path];
    if (!pathItem) {
      throw new Error(`Path ${path} not found in schema`);
    }

    const operation = (pathItem as any)[method];
    if (!operation) {
      throw new Error(`Operation ${method} ${path} not found`);
    }

    const testCases: TestCase[] = [];
    const numTests = options.maxTests || Math.min(this.options.maxTests, 20);

    // Generate valid test cases
    for (let i = 0; i < numTests; i++) {
      const testCase: TestCase = {
        id: `${method}_${path}_valid_${i}`,
        path,
        method: method.toUpperCase(),
        operation,
        type: "valid",
        parameters: this.generateParameters(operation, schema, { valid: true }),
        requestBody: this.generateRequestBody(operation, schema, {
          valid: true,
        }),
        headers: this.generateHeaders(operation, schema),
        expectedOutcome: "success",
      };
      testCases.push(testCase);
    }

    // Generate invalid test cases if enabled
    if (this.options.generateInvalidData) {
      for (let i = 0; i < Math.floor(numTests / 2); i++) {
        const testCase: TestCase = {
          id: `${method}_${path}_invalid_${i}`,
          path,
          method: method.toUpperCase(),
          operation,
          type: "invalid",
          parameters: this.generateParameters(operation, schema, {
            valid: false,
          }),
          requestBody: this.generateRequestBody(operation, schema, {
            valid: false,
          }),
          headers: this.generateHeaders(operation, schema),
          expectedOutcome: "client_error",
        };
        testCases.push(testCase);
      }
    }

    return testCases;
  }

  /**
   * Generate parameters for an operation
   */
  private generateParameters(
    operation: any,
    schema: OpenAPISchema,
    options: GenerationOptions = {}
  ): TestParameters {
    const parameters: TestParameters = {};

    if (!operation.parameters) return parameters;

    for (const param of operation.parameters) {
      const value = this.generateValueForSchema(
        param.schema || param,
        schema,
        options
      );

      if (param.in === "path") {
        parameters.path = parameters.path || {};
        parameters.path[param.name] = value;
      } else if (param.in === "query") {
        parameters.query = parameters.query || {};
        parameters.query[param.name] = value;
      } else if (param.in === "header") {
        parameters.header = parameters.header || {};
        parameters.header[param.name] = value;
      }
    }

    return parameters;
  }

  /**
   * Generate request body for an operation
   */
  private generateRequestBody(
    operation: any,
    schema: OpenAPISchema,
    options: GenerationOptions = {}
  ): RequestBody | null {
    if (!operation.requestBody) return null;

    const contentTypes = Object.keys(operation.requestBody.content || {});
    if (contentTypes.length === 0) return null;

    // Prefer JSON content type
    let contentType =
      contentTypes.find((ct) => ct.includes("json")) || contentTypes[0];
    const mediaType = operation.requestBody.content[contentType];

    if (!mediaType.schema) return null;

    return {
      contentType,
      data: this.generateValueForSchema(mediaType.schema, schema, options),
    };
  }

  /**
   * Generate headers for an operation
   */
  private generateHeaders(
    operation: any,
    schema: OpenAPISchema
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Add any required headers from parameters
    if (operation.parameters) {
      operation.parameters
        .filter((p: ParameterObject) => p.in === "header" && p.required)
        .forEach((p: ParameterObject) => {
          headers[p.name] = this.generateValueForSchema(
            p.schema || (p as any),
            schema,
            {
              valid: true,
            }
          );
        });
    }

    return headers;
  }

  /**
   * Generate value based on JSON Schema
   */
  private generateValueForSchema(
    schema: JSONSchema,
    rootSchema: OpenAPISchema,
    options: GenerationOptions = {}
  ): any {
    if (!schema) return null;

    // Handle $ref
    if (schema.$ref) {
      const resolved = this.resolveReference(rootSchema, schema.$ref);
      return this.generateValueForSchema(resolved, rootSchema, options);
    }

    const { valid = true } = options;
    const type = schema.type || "string";

    try {
      switch (type) {
        case "string":
          return this.generateString(schema, valid);
        case "number":
        case "integer":
          return this.generateNumber(schema, valid);
        case "boolean":
          return this.generateBoolean(schema, valid);
        case "array":
          return this.generateArray(schema, rootSchema, options);
        case "object":
          return this.generateObject(schema, rootSchema, options);
        default:
          return this.generateString(schema, valid);
      }
    } catch (error) {
      // Fallback to simple generation
      return this.generateFallbackValue(type, valid);
    }
  }

  /**
   * Generate string values
   */
  private generateString(schema: JSONSchema, valid: boolean = true): string {
    const constraints: fc.StringConstraints = {};

    if (schema.minLength !== undefined)
      constraints.minLength = schema.minLength;
    if (schema.maxLength !== undefined)
      constraints.maxLength = Math.min(schema.maxLength, 1000);

    if (schema.enum) {
      if (valid) {
        return fc.sample(fc.constantFrom(...schema.enum), 1)[0];
      } else {
        return fc.sample(fc.string(), 1)[0]; // Invalid: not in enum
      }
    }

    if (schema.format) {
      switch (schema.format) {
        case "email":
          return valid ? fc.sample(fc.emailAddress(), 1)[0] : "invalid-email";
        case "uuid":
          return valid ? fc.sample(fc.uuid(), 1)[0] : "invalid-uuid";
        case "date":
          return valid
            ? new Date().toISOString().split("T")[0]
            : "invalid-date";
        case "date-time":
          return valid ? new Date().toISOString() : "invalid-datetime";
        case "uri":
          return valid ? "https://example.com" : "invalid-uri";
        default:
          break;
      }
    }

    if (schema.pattern && valid) {
      // For patterns, generate a simple valid example
      return this.generateFromPattern(schema.pattern);
    }

    // Generate basic string
    const generator = fc.string(constraints);
    const samples = fc.sample(generator, 1);

    if (!valid && samples[0]) {
      // Make it invalid by adding invalid characters or violating constraints
      if (schema.maxLength !== undefined) {
        return "x".repeat(schema.maxLength + 10);
      }
    }

    return samples[0] || "test";
  }

  /**
   * Generate number values
   */
  private generateNumber(
    schema: JSONSchema,
    valid: boolean = true
  ): number | string {
    const constraints: fc.IntegerConstraints | fc.FloatConstraints = {};

    if (schema.minimum !== undefined) constraints.min = schema.minimum;
    if (schema.maximum !== undefined) constraints.max = schema.maximum;

    const isInteger = schema.type === "integer";
    const generator = isInteger
      ? fc.integer(constraints as fc.IntegerConstraints)
      : fc.float(constraints as fc.FloatConstraints);

    const samples = fc.sample(generator, 1);
    let value = samples[0];

    if (value === undefined) {
      value = isInteger ? 42 : 42.5;
    }

    if (!valid) {
      // Make it invalid
      if (schema.maximum !== undefined) {
        value = schema.maximum + (isInteger ? 1 : 0.1);
      } else if (schema.minimum !== undefined) {
        value = schema.minimum - (isInteger ? 1 : 0.1);
      } else {
        return isInteger ? "not-a-number" : "not-a-number";
      }
    }

    return value;
  }

  /**
   * Generate boolean values
   */
  private generateBoolean(
    schema: JSONSchema,
    valid: boolean = true
  ): boolean | string {
    if (!valid) {
      return "not-a-boolean";
    }
    return fc.sample(fc.boolean(), 1)[0];
  }

  /**
   * Generate array values
   */
  private generateArray(
    schema: JSONSchema,
    rootSchema: OpenAPISchema,
    options: GenerationOptions = {}
  ): any[] | string {
    const { valid = true } = options;
    const items = schema.items || { type: "string" };

    const minItems = schema.minItems || 0;
    const maxItems = Math.min(schema.maxItems || 10, 10);

    const length =
      Math.floor(Math.random() * (maxItems - minItems + 1)) + minItems;
    const array: any[] = [];

    for (let i = 0; i < length; i++) {
      array.push(this.generateValueForSchema(items, rootSchema, options));
    }

    if (!valid && schema.maxItems !== undefined) {
      // Make array too long
      while (array.length <= schema.maxItems) {
        array.push(
          this.generateValueForSchema(items, rootSchema, { valid: true })
        );
      }
    }

    return array;
  }

  /**
   * Generate object values
   */
  private generateObject(
    schema: JSONSchema,
    rootSchema: OpenAPISchema,
    options: GenerationOptions = {}
  ): Record<string, any> {
    const { valid = true } = options;
    const obj: Record<string, any> = {};

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired =
          schema.required && schema.required.includes(propName);

        if (isRequired || Math.random() > 0.3) {
          obj[propName] = this.generateValueForSchema(
            propSchema,
            rootSchema,
            options
          );
        }
      }
    }

    if (!valid && schema.required) {
      // Make it invalid by removing a required property
      const requiredProp =
        schema.required[Math.floor(Math.random() * schema.required.length)];
      delete obj[requiredProp];
    }

    return obj;
  }

  /**
   * Generate from regex pattern (simplified)
   */
  private generateFromPattern(pattern: string): string {
    // Simple pattern matching for common cases
    if (pattern === "^[a-zA-Z0-9]+$") return "abc123";
    if (pattern.includes("[0-9]")) return "123";
    if (pattern.includes("[a-z]")) return "abc";
    return "pattern_match";
  }

  /**
   * Fallback value generation
   */
  private generateFallbackValue(type: string, valid: boolean = true): any {
    switch (type) {
      case "string":
        return valid ? "test" : null;
      case "number":
        return valid ? 42 : "invalid";
      case "integer":
        return valid ? 42 : "invalid";
      case "boolean":
        return valid ? true : "invalid";
      case "array":
        return valid ? [] : "invalid";
      case "object":
        return valid ? {} : "invalid";
      default:
        return valid ? "unknown" : null;
    }
  }

  /**
   * Resolve schema reference
   */
  private resolveReference(schema: OpenAPISchema, ref: string): any {
    if (!ref.startsWith("#/")) {
      throw new Error("Only local references are supported");
    }

    const path = ref.substring(2).split("/");
    let current: any = schema;

    for (const segment of path) {
      current = current[segment];
      if (!current) {
        throw new Error(`Invalid reference: ${ref}`);
      }
    }

    return current;
  }
}

export default TestGenerator;
