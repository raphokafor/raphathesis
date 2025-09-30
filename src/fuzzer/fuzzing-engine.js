import fc from "fast-check";

/**
 * Fuzzing Engine
 * Generates malformed, edge case, and malicious inputs to test API robustness
 */
export class FuzzingEngine {
  constructor(options = {}) {
    this.options = {
      maxFuzzTests: options.maxFuzzTests || 50,
      aggressiveness: options.aggressiveness || "medium", // low, medium, high
      includeSecurityTests: options.includeSecurityTests !== false,
      includeBoundaryTests: options.includeBoundaryTests !== false,
      includeTypeConfusion: options.includeTypeConfusion !== false,
      ...options,
    };

    this.fuzzStrategies = this.initializeFuzzStrategies();
  }

  /**
   * Initialize fuzzing strategies based on aggressiveness level
   */
  initializeFuzzStrategies() {
    const strategies = {
      low: ["boundary", "nulls", "empty"],
      medium: [
        "boundary",
        "nulls",
        "empty",
        "overflow",
        "type_confusion",
        "encoding",
      ],
      high: [
        "boundary",
        "nulls",
        "empty",
        "overflow",
        "type_confusion",
        "encoding",
        "injection",
        "malformed",
      ],
    };

    return strategies[this.options.aggressiveness] || strategies.medium;
  }

  /**
   * Generate fuzz tests for a specific endpoint
   */
  async generateFuzzTests(schema, path, method, options = {}) {
    const operation = schema.paths[path][method];
    if (!operation) {
      throw new Error(`Operation ${method} ${path} not found`);
    }

    const fuzzTests = [];
    const numTests = options.maxTests || this.options.maxFuzzTests;

    // Generate different types of fuzz tests
    for (const strategy of this.fuzzStrategies) {
      const strategyTests = this.generateStrategyTests(
        operation,
        schema,
        path,
        method,
        strategy,
        Math.ceil(numTests / this.fuzzStrategies.length)
      );
      fuzzTests.push(...strategyTests);
    }

    return fuzzTests.slice(0, numTests);
  }

  /**
   * Generate tests for a specific fuzzing strategy
   */
  generateStrategyTests(operation, schema, path, method, strategy, count) {
    const tests = [];

    for (let i = 0; i < count; i++) {
      const test = {
        id: `${method}_${path}_fuzz_${strategy}_${i}`,
        path,
        method: method.toUpperCase(),
        operation,
        type: "fuzz",
        strategy,
        parameters: this.fuzzParameters(operation, schema, strategy),
        requestBody: this.fuzzRequestBody(operation, schema, strategy),
        headers: this.fuzzHeaders(operation, schema, strategy),
        expectedOutcome: this.getExpectedOutcome(strategy),
      };
      tests.push(test);
    }

    return tests;
  }

  /**
   * Fuzz parameters based on strategy
   */
  fuzzParameters(operation, schema, strategy) {
    const parameters = {};

    if (!operation.parameters) return parameters;

    for (const param of operation.parameters) {
      const fuzzValue = this.fuzzValue(param.schema || param, strategy);

      if (param.in === "path") {
        parameters.path = parameters.path || {};
        parameters.path[param.name] = fuzzValue;
      } else if (param.in === "query") {
        parameters.query = parameters.query || {};
        parameters.query[param.name] = fuzzValue;
      } else if (param.in === "header") {
        parameters.header = parameters.header || {};
        parameters.header[param.name] = fuzzValue;
      }
    }

    return parameters;
  }

  /**
   * Fuzz request body based on strategy
   */
  fuzzRequestBody(operation, schema, strategy) {
    if (!operation.requestBody) return null;

    const contentTypes = Object.keys(operation.requestBody.content || {});
    if (contentTypes.length === 0) return null;

    const contentType =
      contentTypes.find((ct) => ct.includes("json")) || contentTypes[0];
    const mediaType = operation.requestBody.content[contentType];

    if (!mediaType.schema) return null;

    return {
      contentType,
      data: this.fuzzValue(mediaType.schema, strategy, schema),
    };
  }

  /**
   * Fuzz headers based on strategy
   */
  fuzzHeaders(operation, schema, strategy) {
    const headers = {};

    switch (strategy) {
      case "injection":
        headers["X-Forwarded-For"] = "127.0.0.1; DROP TABLE users; --";
        headers["User-Agent"] = '<script>alert("xss")</script>';
        break;
      case "overflow":
        headers["X-Large-Header"] = "A".repeat(10000);
        break;
      case "encoding":
        headers["Content-Type"] = "application/json; charset=utf-8\x00";
        break;
      case "malformed":
        headers["Authorization"] = "Bearer \x00\x01\x02";
        break;
    }

    return headers;
  }

  /**
   * Generate fuzzed value based on schema and strategy
   */
  fuzzValue(schema, strategy, rootSchema = null) {
    if (!schema) return null;

    // Handle $ref
    if (schema.$ref && rootSchema) {
      const resolved = this.resolveReference(rootSchema, schema.$ref);
      return this.fuzzValue(resolved, strategy, rootSchema);
    }

    const type = schema.type || "string";

    switch (strategy) {
      case "boundary":
        return this.generateBoundaryValue(schema, type);
      case "nulls":
        return this.generateNullValue(type);
      case "empty":
        return this.generateEmptyValue(type);
      case "overflow":
        return this.generateOverflowValue(schema, type);
      case "type_confusion":
        return this.generateTypeConfusionValue(type);
      case "encoding":
        return this.generateEncodingValue(schema, type);
      case "injection":
        return this.generateInjectionValue(schema, type);
      case "malformed":
        return this.generateMalformedValue(schema, type);
      default:
        return this.generateBoundaryValue(schema, type);
    }
  }

  /**
   * Generate boundary values
   */
  generateBoundaryValue(schema, type) {
    switch (type) {
      case "string":
        if (schema.maxLength !== undefined) {
          return "x".repeat(schema.maxLength);
        }
        if (schema.minLength !== undefined) {
          return "x".repeat(schema.minLength);
        }
        return "";

      case "number":
      case "integer":
        if (schema.maximum !== undefined) {
          return schema.maximum;
        }
        if (schema.minimum !== undefined) {
          return schema.minimum;
        }
        return type === "integer" ? Number.MAX_SAFE_INTEGER : Number.MAX_VALUE;

      case "array":
        if (schema.maxItems !== undefined) {
          return new Array(schema.maxItems).fill("item");
        }
        if (schema.minItems !== undefined) {
          return new Array(schema.minItems).fill("item");
        }
        return [];

      default:
        return null;
    }
  }

  /**
   * Generate null/undefined values
   */
  generateNullValue(type) {
    const nullValues = [null, undefined, "", 0, false, [], {}];
    return nullValues[Math.floor(Math.random() * nullValues.length)];
  }

  /**
   * Generate empty values
   */
  generateEmptyValue(type) {
    switch (type) {
      case "string":
        return "";
      case "array":
        return [];
      case "object":
        return {};
      case "number":
      case "integer":
        return 0;
      case "boolean":
        return false;
      default:
        return null;
    }
  }

  /**
   * Generate overflow values
   */
  generateOverflowValue(schema, type) {
    switch (type) {
      case "string":
        const length = schema.maxLength ? schema.maxLength * 10 : 100000;
        return "A".repeat(length);

      case "number":
        return Number.MAX_VALUE * 2;

      case "integer":
        return Number.MAX_SAFE_INTEGER * 2;

      case "array":
        const arrayLength = schema.maxItems ? schema.maxItems * 10 : 10000;
        return new Array(arrayLength).fill("overflow");

      case "object":
        const obj = {};
        for (let i = 0; i < 1000; i++) {
          obj[`key_${i}`] = `value_${i}`;
        }
        return obj;

      default:
        return "overflow";
    }
  }

  /**
   * Generate type confusion values
   */
  generateTypeConfusionValue(expectedType) {
    const wrongTypes = {
      string: [42, true, [], {}, null],
      number: ["not_a_number", true, [], {}],
      integer: [3.14, "not_an_integer", true, []],
      boolean: ["true", 1, 0, [], {}],
      array: ["not_an_array", 42, true, {}],
      object: ["not_an_object", 42, true, []],
    };

    const options = wrongTypes[expectedType] || ["wrong_type"];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Generate encoding attack values
   */
  generateEncodingValue(schema, type) {
    if (type !== "string") return this.generateBoundaryValue(schema, type);

    const encodingAttacks = [
      "\x00\x01\x02\x03", // Null bytes
      "\u0000\u0001\u0002", // Unicode null
      "\uFEFF", // BOM
      "%00%01%02", // URL encoded nulls
      "\r\n\r\n", // CRLF injection
      "\u2028\u2029", // Line/paragraph separators
      "\uD800\uDC00", // Surrogate pairs
      "\\x00\\x01\\x02", // Escaped nulls
    ];

    return encodingAttacks[Math.floor(Math.random() * encodingAttacks.length)];
  }

  /**
   * Generate injection attack values
   */
  generateInjectionValue(schema, type) {
    if (type !== "string") return this.generateTypeConfusionValue(type);

    const injectionPayloads = [
      // SQL Injection
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "1' UNION SELECT * FROM users--",

      // XSS
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src=x onerror=alert("xss")>',

      // Command Injection
      "; cat /etc/passwd",
      "`whoami`",
      "$(whoami)",

      // LDAP Injection
      "*)(uid=*))(|(uid=*",

      // XML Injection
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',

      // Path Traversal
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",

      // Template Injection
      "{{7*7}}",
      "${7*7}",
      "<%= 7*7 %>",
    ];

    return injectionPayloads[
      Math.floor(Math.random() * injectionPayloads.length)
    ];
  }

  /**
   * Generate malformed values
   */
  generateMalformedValue(schema, type) {
    switch (type) {
      case "string":
        return String.fromCharCode(0, 1, 2, 3, 4, 5);

      case "number":
      case "integer":
        return [NaN, Infinity, -Infinity][Math.floor(Math.random() * 3)];

      case "array":
        // Circular reference
        const arr = [];
        arr.push(arr);
        return arr;

      case "object":
        // Circular reference
        const obj = {};
        obj.self = obj;
        return obj;

      default:
        return "\x00\x01\x02";
    }
  }

  /**
   * Get expected outcome for strategy
   */
  getExpectedOutcome(strategy) {
    switch (strategy) {
      case "boundary":
      case "nulls":
      case "empty":
        return "client_error"; // 400-level errors expected

      case "overflow":
      case "malformed":
        return "server_error"; // 500-level errors possible

      case "type_confusion":
      case "encoding":
      case "injection":
        return "client_error"; // Should be rejected with 400-level

      default:
        return "client_error";
    }
  }

  /**
   * Resolve schema reference
   */
  resolveReference(schema, ref) {
    if (!ref.startsWith("#/")) {
      throw new Error("Only local references are supported");
    }

    const path = ref.substring(2).split("/");
    let current = schema;

    for (const segment of path) {
      current = current[segment];
      if (!current) {
        throw new Error(`Invalid reference: ${ref}`);
      }
    }

    return current;
  }
}

export default FuzzingEngine;
