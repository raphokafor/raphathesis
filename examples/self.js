// test-api.js
import { JSSchemathesis } from "./src/index.js";

async function testAPI() {
  const tester = new JSSchemathesis({
    baseURL: "https://petstore.swagger.io/v2",
    maxTests: 20,
    verbose: true,
  });

  try {
    const report = await tester.runFromSchema(
      "https://petstore.swagger.io/v2/swagger.json"
    );
    console.log(report);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testAPI();
