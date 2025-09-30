import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import axios, { AxiosResponse } from "axios";
import Ajv from "ajv";
import type { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import type { OpenAPISchema, ParsedEndpoint } from "../types/index.js";
import { SchemaParsingError } from "../types/index.js";

/**
 * OpenAPI Schema Parser
 * Handles parsing and validation of OpenAPI 2.0/3.0 specifications
 */
export class OpenAPIParser {
  private readonly ajv: Ajv;
  private readonly supportedVersions: string[];

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
  async parse(source: string): Promise<OpenAPISchema> {
    let rawSchema: string | object;

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
      throw new SchemaParsingError(
        `Failed to parse OpenAPI schema: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Check if source is a URL
   */
  private isURL(source: string): boolean {
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
  private async loadFromURL(url: string): Promise<any> {
    try {
      const response: AxiosResponse = await axios.get(url, {
        timeout: 10000,
        headers: {
          Accept: "application/json, application/yaml, text/yaml, text/plain",
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to fetch schema from URL: ${(error as Error).message}`
      );
    }
  }

  /**
   * Load schema from file
   */
  private async loadFromFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read schema file: ${(error as Error).message}`
      );
    }
  }

  /**
   * Parse YAML or JSON content
   */
  private parseContent(content: string | object): OpenAPISchema {
    if (typeof content === "object") {
      return content as OpenAPISchema; // Already parsed (from URL)
    }

    try {
      // Try JSON first
      return JSON.parse(content) as OpenAPISchema;
    } catch {
      try {
        // Try YAML
        return yaml.load(content) as OpenAPISchema;
      } catch (error) {
        throw new Error(
          `Invalid JSON/YAML format: ${(error as Error).message}`
        );
      }
    }
  }

  /**
   * Basic schema validation
   */
  private validateSchema(schema: any): asserts schema is OpenAPISchema {
    if (!schema || typeof schema !== "object") {
      throw new Error("Schema must be a valid object");
    }

    // Check for OpenAPI version
    const version = (schema as any).openapi || (schema as any).swagger;
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
  private normalizeSchema(schema: OpenAPISchema): void {
    // Ensure we have a consistent structure
    (schema as any).info = (schema as any).info || {};

    if ("openapi" in schema) {
      // OpenAPI 3.x
      schema.servers = schema.servers || [{ url: "" }];
      schema.components = schema.components || {};
      schema.components.schemas = schema.components.schemas || {};
    } else {
      // Swagger 2.0
      const swagger2Schema = schema as OpenAPIV2.Document;
      (swagger2Schema as any).servers = (swagger2Schema as any).servers || [
        { url: "" },
      ];
      (swagger2Schema as any).components =
        (swagger2Schema as any).components || {};
      (swagger2Schema as any).components.schemas =
        (swagger2Schema as any).components.schemas ||
        swagger2Schema.definitions ||
        {};
    }

    // Convert Swagger 2.0 to OpenAPI 3.0 structure if needed
    if ("swagger" in schema) {
      this.convertSwagger2ToOpenAPI3(schema as OpenAPIV2.Document);
    }

    // Normalize paths
    this.normalizePaths(schema);
  }

  /**
   * Convert Swagger 2.0 to OpenAPI 3.0 structure
   */
  private convertSwagger2ToOpenAPI3(schema: OpenAPIV2.Document): void {
    const anySchema = schema as any;

    // Convert host + basePath to servers
    if (schema.host || schema.basePath) {
      const protocol =
        schema.schemes && schema.schemes.includes("https") ? "https" : "http";
      const host = schema.host || "localhost";
      const basePath = schema.basePath || "";
      anySchema.servers = [{ url: `${protocol}://${host}${basePath}` }];
    }

    // Move definitions to components/schemas
    if (schema.definitions) {
      anySchema.components = anySchema.components || {};
      anySchema.components.schemas = schema.definitions;
      // Keep definitions for reference resolution
      // delete (schema as any).definitions;
    }

    // Convert parameters and responses in paths
    this.convertSwagger2Paths(schema);
  }

  /**
   * Convert Swagger 2.0 paths to OpenAPI 3.0
   */
  private convertSwagger2Paths(schema: OpenAPIV2.Document): void {
    for (const [pathKey, pathItem] of Object.entries(schema.paths || {})) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation !== "object" || !(operation as any).parameters)
          continue;

        const anyOperation = operation as any;

        // Convert parameters
        const bodyParam = anyOperation.parameters.find(
          (p: any) => p.in === "body"
        );
        if (bodyParam) {
          anyOperation.requestBody = {
            content: {
              "application/json": {
                schema: (bodyParam as any).schema,
              },
            },
            required: bodyParam.required,
          };
          anyOperation.parameters = anyOperation.parameters.filter(
            (p: any) => p.in !== "body"
          );
        }
      }
    }
  }

  /**
   * Normalize paths for consistent processing
   */
  private normalizePaths(schema: OpenAPISchema): void {
    for (const [pathKey, pathItem] of Object.entries(schema.paths || {})) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation !== "object") continue;

        const anyOperation = operation as any;

        // Ensure operation has required fields
        anyOperation.parameters = anyOperation.parameters || [];
        anyOperation.responses = anyOperation.responses || {};
        anyOperation.operationId =
          anyOperation.operationId ||
          `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, "_")}`;

        // Normalize parameters
        anyOperation.parameters.forEach((param: any) => {
          param.required = param.required || false;
          param.schema = param.schema || { type: param.type || "string" };
        });
      }
    }
  }

  /**
   * Get all endpoints from schema
   */
  getEndpoints(schema: OpenAPISchema): ParsedEndpoint[] {
    const endpoints: ParsedEndpoint[] = [];

    for (const [path, pathItem] of Object.entries(schema.paths || {})) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation === "object" && (operation as any).responses) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            operation: operation as OpenAPIV3.OperationObject,
            operationId: (operation as any).operationId,
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Resolve schema references ($ref)
   */
  resolveReference(schema: OpenAPISchema, ref: string): any {
    if (!ref.startsWith("#/")) {
      throw new Error("Only local references are supported");
    }

    const path = ref.substring(2).split("/");
    let current: any = schema;

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
