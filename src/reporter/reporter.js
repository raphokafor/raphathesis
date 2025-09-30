import chalk from "chalk";
import fs from "fs/promises";
import path from "path";

/**
 * Test Results Reporter
 * Generates detailed reports of test execution results
 */
export class Reporter {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      outputFormat: options.outputFormat || "console", // console, json, html
      outputFile: options.outputFile || null,
      includePassedTests: options.includePassedTests !== false,
      includeRequestDetails: options.includeRequestDetails || false,
      ...options,
    };
  }

  /**
   * Generate comprehensive test report
   */
  async generateReport(results) {
    const report = this.analyzeResults(results);

    switch (this.options.outputFormat) {
      case "json":
        return this.generateJsonReport(report);
      case "html":
        return this.generateHtmlReport(report);
      case "console":
      default:
        return this.generateConsoleReport(report);
    }
  }

  /**
   * Analyze test results and generate statistics
   */
  analyzeResults(results) {
    const analysis = {
      summary: this.generateSummary(results),
      byEndpoint: this.groupByEndpoint(results),
      byStrategy: this.groupByStrategy(results),
      failures: results.filter((r) => r.status === "failed"),
      errors: results.filter((r) => r.status === "error"),
      security: this.analyzeSecurityIssues(results),
      performance: this.analyzePerformance(results),
      coverage: this.analyzeCoverage(results),
      timestamp: new Date().toISOString(),
      results,
    };

    return analysis;
  }

  /**
   * Generate test summary statistics
   */
  generateSummary(results) {
    const total = results.length;
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const errors = results.filter((r) => r.status === "error").length;

    const totalDuration = results.reduce(
      (sum, r) => sum + (r.duration || 0),
      0
    );
    const avgDuration = total > 0 ? totalDuration / total : 0;

    return {
      total,
      passed,
      failed,
      errors,
      passRate: total > 0 ? ((passed / total) * 100).toFixed(2) : 0,
      totalDuration,
      averageDuration: Math.round(avgDuration),
      startTime: results.length > 0 ? results[0].timestamp : null,
      endTime:
        results.length > 0 ? results[results.length - 1].timestamp : null,
    };
  }

  /**
   * Group results by endpoint
   */
  groupByEndpoint(results) {
    const grouped = {};

    for (const result of results) {
      const key = `${result.testCase.method} ${result.testCase.path}`;
      if (!grouped[key]) {
        grouped[key] = {
          endpoint: key,
          total: 0,
          passed: 0,
          failed: 0,
          errors: 0,
          results: [],
        };
      }

      grouped[key].total++;
      grouped[key][result.status]++;
      grouped[key].results.push(result);
    }

    return Object.values(grouped);
  }

  /**
   * Group results by testing strategy
   */
  groupByStrategy(results) {
    const grouped = {};

    for (const result of results) {
      const strategy =
        result.testCase.strategy || result.testCase.type || "unknown";
      if (!grouped[strategy]) {
        grouped[strategy] = {
          strategy,
          total: 0,
          passed: 0,
          failed: 0,
          errors: 0,
          results: [],
        };
      }

      grouped[strategy].total++;
      grouped[strategy][result.status]++;
      grouped[strategy].results.push(result);
    }

    return Object.values(grouped);
  }

  /**
   * Analyze security-related findings
   */
  analyzeSecurityIssues(results) {
    const securityIssues = [];

    for (const result of results) {
      // Check for potential security issues
      if (
        result.status === "passed" &&
        result.testCase.strategy === "injection"
      ) {
        securityIssues.push({
          severity: "high",
          type: "injection_accepted",
          endpoint: `${result.testCase.method} ${result.testCase.path}`,
          description:
            "Injection payload was accepted without proper validation",
          testId: result.id,
        });
      }

      if (
        result.response &&
        result.response.status === 500 &&
        result.testCase.strategy === "overflow"
      ) {
        securityIssues.push({
          severity: "medium",
          type: "dos_potential",
          endpoint: `${result.testCase.method} ${result.testCase.path}`,
          description:
            "Large payload caused server error - potential DoS vulnerability",
          testId: result.id,
        });
      }

      // Check for information disclosure
      if (
        result.response &&
        result.response.data &&
        typeof result.response.data === "string"
      ) {
        if (
          result.response.data.includes("stack trace") ||
          result.response.data.includes("Exception")
        ) {
          securityIssues.push({
            severity: "low",
            type: "information_disclosure",
            endpoint: `${result.testCase.method} ${result.testCase.path}`,
            description: "Error response may contain sensitive information",
            testId: result.id,
          });
        }
      }
    }

    return {
      total: securityIssues.length,
      high: securityIssues.filter((i) => i.severity === "high").length,
      medium: securityIssues.filter((i) => i.severity === "medium").length,
      low: securityIssues.filter((i) => i.severity === "low").length,
      issues: securityIssues,
    };
  }

  /**
   * Analyze performance metrics
   */
  analyzePerformance(results) {
    const durations = results.map((r) => r.duration || 0).filter((d) => d > 0);

    if (durations.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0, slowTests: [] };
    }

    durations.sort((a, b) => a - b);

    const min = durations[0];
    const max = durations[durations.length - 1];
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const median = durations[Math.floor(durations.length / 2)];

    // Find slow tests (> 95th percentile)
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Threshold = durations[p95Index];

    const slowTests = results
      .filter((r) => r.duration > p95Threshold)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    return {
      min: Math.round(min),
      max: Math.round(max),
      avg: Math.round(avg),
      median: Math.round(median),
      p95: Math.round(p95Threshold),
      slowTests,
    };
  }

  /**
   * Analyze test coverage
   */
  analyzeCoverage(results) {
    const endpoints = new Set();
    const methods = new Set();
    const statusCodes = new Set();

    for (const result of results) {
      endpoints.add(`${result.testCase.method} ${result.testCase.path}`);
      methods.add(result.testCase.method);
      if (result.response) {
        statusCodes.add(result.response.status);
      }
    }

    return {
      endpoints: endpoints.size,
      methods: Array.from(methods),
      statusCodes: Array.from(statusCodes).sort(),
      uniqueEndpoints: Array.from(endpoints),
    };
  }

  /**
   * Generate console report
   */
  generateConsoleReport(analysis) {
    const { summary, byEndpoint, failures, errors, security, performance } =
      analysis;

    let output = "\n";
    output += chalk.bold.blue("🧪 JS-Schemathesis Test Report\n");
    output += chalk.gray("=".repeat(50)) + "\n\n";

    // Summary
    output += chalk.bold("📊 Summary:\n");
    output += `  Total Tests: ${summary.total}\n`;
    output += `  ${chalk.green("✅ Passed:")} ${summary.passed}\n`;
    output += `  ${chalk.red("❌ Failed:")} ${summary.failed}\n`;
    output += `  ${chalk.yellow("⚠️  Errors:")} ${summary.errors}\n`;
    output += `  ${chalk.blue("📈 Pass Rate:")} ${summary.passRate}%\n`;
    output += `  ${chalk.blue("⏱️  Duration:")} ${
      summary.totalDuration
    }ms (avg: ${summary.averageDuration}ms)\n\n`;

    // Performance
    if (performance.avg > 0) {
      output += chalk.bold("⚡ Performance:\n");
      output += `  Fastest: ${performance.min}ms\n`;
      output += `  Slowest: ${performance.max}ms\n`;
      output += `  Average: ${performance.avg}ms\n`;
      output += `  Median: ${performance.median}ms\n`;
      if (performance.slowTests.length > 0) {
        output += `  Slow tests (>${performance.p95}ms): ${performance.slowTests.length}\n`;
      }
      output += "\n";
    }

    // Security Issues
    if (security.total > 0) {
      output += chalk.bold.red("🔒 Security Issues Found:\n");
      output += `  ${chalk.red("High:")} ${security.high}\n`;
      output += `  ${chalk.yellow("Medium:")} ${security.medium}\n`;
      output += `  ${chalk.blue("Low:")} ${security.low}\n\n`;

      for (const issue of security.issues.slice(0, 5)) {
        const color =
          issue.severity === "high"
            ? chalk.red
            : issue.severity === "medium"
            ? chalk.yellow
            : chalk.blue;
        output += `  ${color("●")} ${issue.type}: ${issue.endpoint}\n`;
        output += `    ${issue.description}\n`;
      }
      output += "\n";
    }

    // Endpoint Results
    if (byEndpoint.length > 0) {
      output += chalk.bold("🎯 Results by Endpoint:\n");
      for (const endpoint of byEndpoint) {
        const passRate =
          endpoint.total > 0
            ? ((endpoint.passed / endpoint.total) * 100).toFixed(1)
            : 0;
        const status =
          endpoint.failed > 0
            ? chalk.red("❌")
            : endpoint.errors > 0
            ? chalk.yellow("⚠️")
            : chalk.green("✅");
        output += `  ${status} ${endpoint.endpoint} - ${passRate}% (${endpoint.passed}/${endpoint.total})\n`;
      }
      output += "\n";
    }

    // Failures
    if (failures.length > 0) {
      output += chalk.bold.red("❌ Failures:\n");
      for (const failure of failures.slice(0, 10)) {
        output += `  ${chalk.red("●")} ${failure.testCase.method} ${
          failure.testCase.path
        }\n`;
        output += `    ${failure.message || "No message"}\n`;
        if (failure.response) {
          output += `    Status: ${failure.response.status}\n`;
        }
      }
      if (failures.length > 10) {
        output += `  ... and ${failures.length - 10} more failures\n`;
      }
      output += "\n";
    }

    // Errors
    if (errors.length > 0) {
      output += chalk.bold.yellow("⚠️  Errors:\n");
      for (const error of errors.slice(0, 5)) {
        output += `  ${chalk.yellow("●")} ${error.testCase.method} ${
          error.testCase.path
        }\n`;
        output += `    ${error.error}\n`;
      }
      if (errors.length > 5) {
        output += `  ... and ${errors.length - 5} more errors\n`;
      }
      output += "\n";
    }

    return output;
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(analysis) {
    return JSON.stringify(analysis, null, 2);
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(analysis) {
    const { summary, byEndpoint, security } = analysis;

    return `<!DOCTYPE html>
<html>
<head>
    <title>JS-Schemathesis Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #2563eb; }
        .metric-label { font-size: 14px; color: #6b7280; margin-top: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .endpoint { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .status-passed { color: #059669; }
        .status-failed { color: #dc2626; }
        .status-error { color: #d97706; }
        .security-issue { background: #fef2f2; border: 1px solid #fecaca; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .security-high { border-left: 4px solid #dc2626; }
        .security-medium { border-left: 4px solid #d97706; }
        .security-low { border-left: 4px solid #2563eb; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 JS-Schemathesis Test Report</h1>
        <p>Generated on ${new Date(analysis.timestamp).toLocaleString()}</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <div class="metric-value">${summary.total}</div>
            <div class="metric-label">Total Tests</div>
        </div>
        <div class="metric">
            <div class="metric-value status-passed">${summary.passed}</div>
            <div class="metric-label">Passed</div>
        </div>
        <div class="metric">
            <div class="metric-value status-failed">${summary.failed}</div>
            <div class="metric-label">Failed</div>
        </div>
        <div class="metric">
            <div class="metric-value status-error">${summary.errors}</div>
            <div class="metric-label">Errors</div>
        </div>
        <div class="metric">
            <div class="metric-value">${summary.passRate}%</div>
            <div class="metric-label">Pass Rate</div>
        </div>
        <div class="metric">
            <div class="metric-value">${summary.averageDuration}ms</div>
            <div class="metric-label">Avg Duration</div>
        </div>
    </div>
    
    ${
      security.total > 0
        ? `
    <div class="section">
        <h2>🔒 Security Issues</h2>
        ${security.issues
          .map(
            (issue) => `
            <div class="security-issue security-${issue.severity}">
                <strong>${issue.type}</strong> - ${issue.endpoint}<br>
                <small>${issue.description}</small>
            </div>
        `
          )
          .join("")}
    </div>
    `
        : ""
    }
    
    <div class="section">
        <h2>🎯 Results by Endpoint</h2>
        ${byEndpoint
          .map((endpoint) => {
            const passRate =
              endpoint.total > 0
                ? ((endpoint.passed / endpoint.total) * 100).toFixed(1)
                : 0;
            return `
            <div class="endpoint">
                <strong>${endpoint.endpoint}</strong>
                <div>Pass Rate: ${passRate}% (${endpoint.passed}/${endpoint.total})</div>
                <div>
                    <span class="status-passed">✅ ${endpoint.passed}</span>
                    <span class="status-failed">❌ ${endpoint.failed}</span>
                    <span class="status-error">⚠️ ${endpoint.errors}</span>
                </div>
            </div>
          `;
          })
          .join("")}
    </div>
</body>
</html>`;
  }

  /**
   * Save report to file
   */
  async saveReport(content, filename) {
    if (!filename) return;

    try {
      const dir = path.dirname(filename);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filename, content, "utf-8");
      console.log(`📄 Report saved to ${filename}`);
    } catch (error) {
      console.error(`Failed to save report: ${error.message}`);
    }
  }
}

export default Reporter;
