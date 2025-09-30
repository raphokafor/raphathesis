# JS-Schemathesis

🧪 **Property-based API testing framework for TypeScript/JavaScript** - A TypeScript implementation inspired by Python's [schemathesis](https://github.com/schemathesis/schemathesis).

Automatically generate comprehensive test cases from your OpenAPI specifications and discover bugs through property-based testing and intelligent fuzzing.

## Features

- 🎯 **Automatic Test Generation**: Generate test cases from OpenAPI/Swagger specifications
- 🔀 **Property-Based Testing**: Use [fast-check](https://github.com/dubzzz/fast-check) for intelligent test data generation
- 💉 **Advanced Fuzzing**: Built-in fuzzing engine with multiple attack strategies
- 🔒 **Security Testing**: Detect injection vulnerabilities, overflow issues, and more
- 📊 **Rich Reporting**: Console, JSON, and HTML reports with detailed analysis
- ⚡ **Performance Insights**: Track response times and identify slow endpoints
- 🛡️ **Response Validation**: Validate API responses against OpenAPI schemas
- 🔐 **Authentication Support**: Bearer tokens, Basic auth, and custom headers

## Installation

```bash
npm install js-schemathesis
```

Or run directly with npx:

```bash
npx js-schemathesis run https://petstore.swagger.io/v2/swagger.json
```

## Development Setup

For development or to use the TypeScript source:

```bash
git clone <repository-url>
cd js-schemathesis
npm install
npm run build
```

## Quick Start

### Command Line Usage

```bash
# Test an API using OpenAPI schema
js-schemathesis run https://api.example.com/openapi.json \
  --base-url https://api.example.com \
  --header "Authorization:Bearer your-token" \
  --max-tests 50 \
  --format html \
  --output report.html

# Run fuzzing tests on specific endpoint
js-schemathesis fuzz https://api.example.com/openapi.json /users/{id} GET \
  --aggressiveness high \
  --num-tests 100

# Validate OpenAPI schema
js-schemathesis validate https://api.example.com/openapi.json
```

### Programmatic Usage

**TypeScript:**

```typescript
import {
  JSSchemathesis,
  type JSSchemathesisOptions,
  type TestResult,
} from "js-schemathesis";

const options: JSSchemathesisOptions = {
  baseURL: "https://api.example.com",
  auth: { type: "bearer", token: "your-token" },
  maxTests: 100,
  verbose: true,
};

const tester = new JSSchemathesis(options);

// Test entire API
const report: string = await tester.runFromSchema("openapi.json");
console.log(report);

// Test specific endpoint
const schema = await tester.parser.parse("openapi.json");
const results: TestResult[] = await tester.testEndpoint(
  schema,
  "/users/{id}",
  "get"
);

// Run fuzzing tests
const fuzzResults: TestResult[] = await tester.fuzzEndpoint(
  schema,
  "/users",
  "post",
  {
    maxTests: 50,
  }
);
```

**JavaScript:**

```javascript
import { JSSchemathesis } from "js-schemathesis";

const tester = new JSSchemathesis({
  baseURL: "https://api.example.com",
  auth: { type: "bearer", token: "your-token" },
  maxTests: 100,
  verbose: true,
});

// Test entire API
const report = await tester.runFromSchema("openapi.json");
console.log(report);

// Test specific endpoint
const schema = await tester.parser.parse("openapi.json");
const results = await tester.testEndpoint(schema, "/users/{id}", "get");

// Run fuzzing tests
const fuzzResults = await tester.fuzzEndpoint(schema, "/users", "post", {
  maxTests: 50,
});
```

## Configuration Options

| Option              | Type    | Default    | Description                               |
| ------------------- | ------- | ---------- | ----------------------------------------- |
| `baseURL`           | string  | `''`       | Base URL for API requests                 |
| `timeout`           | number  | `10000`    | Request timeout in milliseconds           |
| `maxTests`          | number  | `100`      | Maximum tests per endpoint                |
| `auth`              | object  | `null`     | Authentication configuration              |
| `headers`           | object  | `{}`       | Custom headers for requests               |
| `validateResponses` | boolean | `true`     | Validate responses against schema         |
| `fuzzingEnabled`    | boolean | `true`     | Enable fuzzing tests                      |
| `aggressiveness`    | string  | `'medium'` | Fuzzing aggressiveness: low, medium, high |
| `verbose`           | boolean | `false`    | Enable verbose logging                    |

## Testing Strategies

### Property-Based Testing

Generates valid test data based on OpenAPI schema constraints:

- String length and pattern validation
- Number ranges and type validation
- Array size constraints
- Required vs optional fields
- Enum value testing

### Fuzzing Strategies

Tests API robustness with various attack vectors:

- **Boundary Testing**: Edge cases for string lengths, numbers, arrays
- **Type Confusion**: Wrong data types (string instead of number)
- **Null/Empty Values**: null, undefined, empty strings/arrays
- **Overflow Attacks**: Extremely large payloads
- **Encoding Attacks**: Unicode nulls, CRLF injection, BOMs
- **Injection Attacks**: SQL, XSS, command injection payloads
- **Malformed Data**: Circular references, invalid characters

## Authentication

### Bearer Token

```javascript
const tester = new JSSchemathesis({
  auth: { type: "bearer", token: "your-jwt-token" },
});
```

### Basic Authentication

```javascript
const tester = new JSSchemathesis({
  auth: { type: "basic", username: "user", password: "pass" },
});
```

### Custom Headers

```javascript
const tester = new JSSchemathesis({
  headers: {
    "X-API-Key": "your-api-key",
    "X-Client-Version": "1.0.0",
  },
});
```

## Reporting

### Console Report

Default colorized console output with summary statistics, failures, and security findings.

### JSON Report

Machine-readable format for CI/CD integration:

```bash
js-schemathesis run schema.json --format json --output results.json
```

### HTML Report

Rich visual report with charts and detailed breakdowns:

```bash
js-schemathesis run schema.json --format html --output report.html
```

## Examples

### Basic Testing

```javascript
import { JSSchemathesis } from "js-schemathesis";

const tester = new JSSchemathesis({
  baseURL: "https://petstore.swagger.io/v2",
});

const report = await tester.runFromSchema(
  "https://petstore.swagger.io/v2/swagger.json"
);
```

### Security Testing

```javascript
const tester = new JSSchemathesis({
  baseURL: "https://api.example.com",
  aggressiveness: "high",
  includeSecurityTests: true,
});

const schema = await tester.parser.parse("openapi.json");
const results = await tester.fuzzEndpoint(schema, "/users", "post");

// Check for security issues
const injectionTests = results.filter(
  (r) => r.testCase.strategy === "injection"
);
```

### Batch Testing Multiple APIs

```javascript
const apis = [
  {
    name: "Users API",
    schema: "users-api.json",
    baseURL: "https://users.api.com",
  },
  {
    name: "Orders API",
    schema: "orders-api.json",
    baseURL: "https://orders.api.com",
  },
];

for (const api of apis) {
  const tester = new JSSchemathesis({ baseURL: api.baseURL });
  const report = await tester.runFromSchema(api.schema);
  console.log(`${api.name} Results:`, tester.getSummary());
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install -g js-schemathesis
      - run: js-schemathesis run openapi.json --base-url ${{ secrets.API_URL }} --format json --output results.json
      - uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: results.json
```

### Jenkins

```groovy
pipeline {
  agent any
  stages {
    stage('API Tests') {
      steps {
        sh 'npm install -g js-schemathesis'
        sh 'js-schemathesis run openapi.json --base-url ${API_URL} --format html --output report.html'
        publishHTML([
          allowMissing: false,
          alwaysLinkToLastBuild: true,
          keepAll: true,
          reportDir: '.',
          reportFiles: 'report.html',
          reportName: 'API Test Report'
        ])
      }
    }
  }
}
```

## API Reference

### JSSchemathesis Class

#### Constructor

```javascript
new JSSchemathesis(options);
```

#### Methods

- `runFromSchema(schemaPath)` - Run tests from OpenAPI schema
- `testEndpoint(schema, path, method, options)` - Test specific endpoint
- `fuzzEndpoint(schema, path, method, options)` - Run fuzzing tests
- `getSummary()` - Get test execution summary
- `getResults()` - Get detailed test results

### Parser Class

- `parse(source)` - Parse OpenAPI schema from file or URL
- `getEndpoints(schema)` - Extract all endpoints from schema
- `resolveReference(schema, ref)` - Resolve $ref references

### TestGenerator Class

- `generateTests(schema)` - Generate tests for all endpoints
- `generateForEndpoint(schema, path, method)` - Generate tests for specific endpoint

### FuzzingEngine Class

- `generateFuzzTests(schema, path, method)` - Generate fuzzing tests
- `fuzzValue(schema, strategy)` - Generate fuzzed values by strategy

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

no license required

node src/cli.js run <schema> [options]

Options:
-b, --base-url <url> # Base URL for the API
-H, --header <header> # Custom headers (format: "key:value")
-a, --auth <type:value> # Authentication (bearer:token or basic:user:pass)
-t, --timeout <ms> # Request timeout (default: 10000)
-m, --max-tests <num> # Max tests per endpoint (default: 100)
-o, --output <file> # Output report to file
-f, --format <format> # Output format: console, json, html
-v, --verbose # Verbose output
--no-fuzzing # Disable fuzzing tests
--aggressiveness <level> # Fuzzing level: low, medium, high

## Inspiration

This project is inspired by the excellent [schemathesis](https://github.com/schemathesis/schemathesis) Python library. While maintaining similar core concepts, this JavaScript implementation adds unique features and optimizations for the Node.js ecosystem.

# Quick test with 10 tests per endpoint

node src/cli.js run https://petstore.swagger.io/v2/swagger.json \
 --max-tests 10 \
 --verbose

# Generate HTML report

node src/cli.js run https://petstore.swagger.io/v2/swagger.json \
 --format html \
 --output petstore-report.html

# raphathesis

npm install --save-dev ts-node
npx ts-node examples/basic-usage.ts
