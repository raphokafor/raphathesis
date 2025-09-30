import { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

// Union type for all supported OpenAPI versions
export type OpenAPISchema =
  | OpenAPIV2.Document
  | OpenAPIV3.Document
  | OpenAPIV3_1.Document;

// Test case types
export interface TestCase {
  id: string;
  path: string;
  method: string;
  operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject;
  type: "valid" | "invalid" | "fuzz";
  strategy?: FuzzStrategy;
  parameters: TestParameters;
  requestBody: RequestBody | null;
  headers: Record<string, string>;
  expectedOutcome: ExpectedOutcome;
}

export interface TestParameters {
  path?: Record<string, any>;
  query?: Record<string, any>;
  header?: Record<string, any>;
}

export interface RequestBody {
  contentType: string;
  data: any;
}

export type ExpectedOutcome =
  | "success"
  | "client_error"
  | "server_error"
  | number;

// Test result types
export interface TestResult {
  id: string;
  testCase: TestCase;
  request?: any;
  response?: TestResponse;
  validation?: ValidationResult;
  status: TestStatus;
  message?: string;
  duration?: number;
  timestamp: string;
  error?: string;
}

export interface TestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  message: string;
  validations: ValidationCheck[];
}

export interface ValidationCheck {
  type: "status_code" | "schema" | "headers";
  valid: boolean;
  message: string;
}

export type TestStatus = "passed" | "failed" | "error";

// Fuzzing types
export type FuzzStrategy =
  | "boundary"
  | "nulls"
  | "empty"
  | "overflow"
  | "type_confusion"
  | "encoding"
  | "injection"
  | "malformed";

export type AggressivenessLevel = "low" | "medium" | "high";

// Configuration types
export interface JSSchemathesisOptions {
  baseURL?: string;
  timeout?: number;
  maxTests?: number;
  verbose?: boolean;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  validateResponses?: boolean;
  fuzzingEnabled?: boolean;
  propertyTests?: boolean;
  aggressiveness?: AggressivenessLevel;
  includeSecurityTests?: boolean;
  includeBoundaryTests?: boolean;
  includeTypeConfusion?: boolean;
  includeEdgeCases?: boolean;
  generateInvalidData?: boolean;
  maxFuzzTests?: number;
  seed?: number;
  outputFormat?: OutputFormat;
  outputFile?: string;
  includePassedTests?: boolean;
  includeRequestDetails?: boolean;
  followRedirects?: boolean;
  maxRedirects?: number;
  retries?: number;
}

export interface AuthConfig {
  type: "bearer" | "basic";
  token?: string;
  username?: string;
  password?: string;
}

export type OutputFormat = "console" | "json" | "html";

// Parser types
export interface ParsedEndpoint {
  path: string;
  method: string;
  operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject;
  operationId: string;
}

// Generator types
export interface GenerationOptions {
  valid?: boolean;
  maxTests?: number;
}

// Reporter types
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: string;
  totalDuration?: number;
  averageDuration?: number;
  startTime?: string;
  endTime?: string;
}

export interface EndpointSummary {
  endpoint: string;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  results: TestResult[];
}

export interface StrategySummary {
  strategy: string;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  results: TestResult[];
}

export interface SecurityIssue {
  severity: "high" | "medium" | "low";
  type: string;
  endpoint: string;
  description: string;
  testId: string;
}

export interface SecurityAnalysis {
  total: number;
  high: number;
  medium: number;
  low: number;
  issues: SecurityIssue[];
}

export interface PerformanceAnalysis {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95?: number;
  slowTests: TestResult[];
}

export interface CoverageAnalysis {
  endpoints: number;
  methods: string[];
  statusCodes: number[];
  uniqueEndpoints: string[];
}

export interface TestReport {
  summary: TestSummary;
  byEndpoint: EndpointSummary[];
  byStrategy: StrategySummary[];
  failures: TestResult[];
  errors: TestResult[];
  security: SecurityAnalysis;
  performance: PerformanceAnalysis;
  coverage: CoverageAnalysis;
  timestamp: string;
  results: TestResult[];
}

// HTTP Client types
export interface HttpClientConfig {
  timeout: number;
  baseURL: string;
  headers: Record<string, string>;
  maxRedirects: number;
  auth?: {
    username: string;
    password: string;
  };
}

// Schema validation types
export interface SchemaValidationError {
  keyword: string;
  dataPath: string;
  schemaPath: string;
  params: any;
  message: string;
}

// Utility types
export type JSONSchema = {
  type?: string;
  format?: string;
  enum?: any[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  required?: string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  $ref?: string;
  [key: string]: any;
};

export interface ParameterObject {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  schema?: JSONSchema;
  type?: string;
  format?: string;
  enum?: any[];
  [key: string]: any;
}

// CLI types
export interface CLIOptions {
  baseUrl?: string;
  header: string[];
  auth?: string;
  timeout: string;
  maxTests?: string;
  output?: string;
  format: string;
  verbose?: boolean;
  fuzzing?: boolean;
  propertyTests?: boolean;
  responseValidation?: boolean;
  aggressiveness: string;
  seed?: string;
  numTests?: string;
}

// Error types - exported as values, not types
export class SchemaParsingError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = "SchemaParsingError";
  }
}

export class TestExecutionError extends Error {
  constructor(
    message: string,
    public testCase?: TestCase,
    public cause?: Error
  ) {
    super(message);
    this.name = "TestExecutionError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public validationErrors?: SchemaValidationError[]
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
