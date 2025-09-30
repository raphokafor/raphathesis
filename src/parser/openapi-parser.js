import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import axios from "axios";
import Ajv from "ajv";

/**
 * OpenAPI Schema Parser
 * Handles parsing and validation of OpenAPI 2.0/3.0 specifications
 */
export class OpenAPIParser {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.supportedVersions = [
      "2.0",
      "3.0.0",
      "3.0.1",
      "3.0.2",
      "3.0.3",
      "3.1.0",
    ];
  }

  /**
   * Parse OpenAPI schema from file path or URL
   */
  async parse(source) {
    let rawSchema;

    try {
      if (this.isURL(source)) {
        rawSchema = await this.loadFromURL(source);
      } else {
        rawSchema = await this.loadFromFile(source);
      }

      const schema = this.parseContent(rawSchema);
      this.validateSchema(schema);
      this.normalizeSchema(schema);

      return schema;
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI schema: ${error.message}`);
    }
  }

  /**
   * Check if source is a URL
   */
  isURL(source) {
    try {
      new URL(source);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load schema from URL
   */
  async loadFromURL(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          Accept: "application/json, application/yaml, text/yaml, text/plain",
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch schema from URL: ${error.message}`);
    }
  }

  /**
   * Load schema from file
   */
  async loadFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      throw new Error(`Failed to read schema file: ${error.message}`);
    }
  }

  /**
   * Parse YAML or JSON content
   */
  parseContent(content) {
    if (typeof content === "object") {
      return content; // Already parsed (from URL)
    }

    try {
      // Try JSON first
      return JSON.parse(content);
    } catch {
      try {
        // Try YAML
        return yaml.load(content);
      } catch (error) {
        throw new Error(`Invalid JSON/YAML format: ${error.message}`);
      }
    }
  }

  /**
   * Basic schema validation
   */
  validateSchema(schema) {
    if (!schema || typeof schema !== "object") {
      throw new Error("Schema must be a valid object");
    }

    // Check for OpenAPI version
    const version = schema.openapi || schema.swagger;
    if (!version) {
      throw new Error("Missing OpenAPI/Swagger version field");
    }

    if (!this.supportedVersions.some((v) => version.startsWith(v))) {
      console.warn(`⚠️  OpenAPI version ${version} may not be fully supported`);
    }

    // Check for paths
    if (!schema.paths || typeof schema.paths !== "object") {
      throw new Error("Schema must contain paths object");
    }

    console.log(`✅ Valid OpenAPI ${version} schema`);
  }

  /**
   * Normalize schema for consistent processing
   */
  normalizeSchema(schema) {
    // Ensure we have a consistent structure
    schema.info = schema.info || {};
    schema.servers = schema.servers || [{ url: "" }];
    schema.components = schema.components || {};
    schema.components.schemas =
      schema.components.schemas || schema.definitions || {};

    // Convert Swagger 2.0 to OpenAPI 3.0 structure if needed
    if (schema.swagger) {
      this.convertSwagger2ToOpenAPI3(schema);
    }

    // Normalize paths
    this.normalizePaths(schema);
  }

  /**
   * Convert Swagger 2.0 to OpenAPI 3.0 structure
   */
  convertSwagger2ToOpenAPI3(schema) {
    // Convert host + basePath to servers
    if (schema.host || schema.basePath) {
      const protocol =
        schema.schemes && schema.schemes.includes("https") ? "https" : "http";
      const host = schema.host || "localhost";
      const basePath = schema.basePath || "";
      schema.servers = [{ url: `${protocol}://${host}${basePath}` }];
    }

    // Move definitions to components/schemas
    if (schema.definitions) {
      schema.components = schema.components || {};
      schema.components.schemas = schema.definitions;
      delete schema.definitions;
    }

    // Convert parameters and responses in paths
    this.convertSwagger2Paths(schema);
  }

  /**
   * Convert Swagger 2.0 paths to OpenAPI 3.0
   */
  convertSwagger2Paths(schema) {
    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation !== "object" || !operation.parameters) continue;

        // Convert parameters
        const bodyParam = operation.parameters.find((p) => p.in === "body");
        if (bodyParam) {
          operation.requestBody = {
            content: {
              "application/json": {
                schema: bodyParam.schema,
              },
            },
            required: bodyParam.required,
          };
          operation.parameters = operation.parameters.filter(
            (p) => p.in !== "body"
          );
        }
      }
    }
  }

  /**
   * Normalize paths for consistent processing
   */
  normalizePaths(schema) {
    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation !== "object") continue;

        // Ensure operation has required fields
        operation.parameters = operation.parameters || [];
        operation.responses = operation.responses || {};
        operation.operationId =
          operation.operationId ||
          `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, "_")}`;

        // Normalize parameters
        operation.parameters.forEach((param) => {
          param.required = param.required || false;
          param.schema = param.schema || { type: param.type || "string" };
        });
      }
    }
  }

  /**
   * Get all endpoints from schema
   */
  getEndpoints(schema) {
    const endpoints = [];

    for (const [path, pathItem] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation === "object" && operation.responses) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            operation,
            operationId: operation.operationId,
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Resolve schema references ($ref)
   */
  resolveReference(schema, ref) {
    if (!ref.startsWith("#/")) {
      throw new Error("Only local references are supported");
    }

    const path = ref.substring(2).split("/");
    let current = schema;

    for (const segment of path) {
      if (!current || typeof current !== "object") {
        throw new Error(`Invalid reference: ${ref}`);
      }
      current = current[segment];
    }

    return current;
  }
}

export default OpenAPIParser;
