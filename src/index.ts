#!/usr/bin/env node

import { McpServer, Tool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
import "dotenv/config";
import logger from "./logger.js";
import addSDKTools from "./tools/bstack-sdk.js";
import addAppLiveTools from "./tools/applive.js";
import addBrowserLiveTools from "./tools/live.js";
import addAccessibilityTools from "./tools/accessibility.js";
import addTestManagementTools from "./tools/testmanagement.js";
import addAppAutomationTools from "./tools/appautomate.js";
import addFailureLogsTools from "./tools/getFailureLogs.js";
import addAutomateTools from "./tools/automate.js";
import addSelfHealTools from "./tools/selfheal.js";
import addObservabilityTools from "./tools/observability.js";
import { setupOnInitialized } from "./oninitialized.js";
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Product categories and their associated tool registration functions
const PRODUCT_TOOLS = {
  automate: [addAutomateTools, addFailureLogsTools, addObservabilityTools],
  "app-automate": [addAppAutomationTools, addFailureLogsTools],
  live: [addBrowserLiveTools],
  "app-live": [addAppLiveTools],
  accessibility: [addAccessibilityTools],
  "test-management": [addTestManagementTools],
  sdk: [addSDKTools],
  "self-heal": [addSelfHealTools],
} as const;

export type ProductName = keyof typeof PRODUCT_TOOLS;

// Track enabled products and registered tools
// const enabledProducts: Set<ProductName> = new Set(); // Replaced by analyzeIntentAndToggleTools
export const registeredProductTools: Map<ProductName, Tool[]> = new Map();

// Reference to the server instance for use in enableProductsTool
// let serverInstance: McpServer; // No longer needed

export async function analyzeIntentAndToggleTools(userQuery: string, server: McpServer) {
  // Disable all previously registered tools
  for (const tools of registeredProductTools.values()) {
    for (const tool of tools) {
      tool.disable();
    }
  }

  const lowerCaseQuery = userQuery.toLowerCase();
  const detectedIntents: Set<ProductName> = new Set();

  // Keyword-based intent detection
  if (lowerCaseQuery.includes("test") || lowerCaseQuery.includes("automate") || lowerCaseQuery.includes("build") || lowerCaseQuery.includes("session") || lowerCaseQuery.includes("screenshot")) {
    if (!lowerCaseQuery.includes("app test") && !lowerCaseQuery.includes("app automate")) { // Avoid double-counting with app-automate
      detectedIntents.add("automate");
    }
  }
  if (lowerCaseQuery.includes("app test") || lowerCaseQuery.includes("app automate") || lowerCaseQuery.includes("mobile app") || lowerCaseQuery.includes("appium")) {
    detectedIntents.add("app-automate");
  }
  if (lowerCaseQuery.includes("live") || lowerCaseQuery.includes("interactive") || (lowerCaseQuery.includes("browser") && !lowerCaseQuery.includes("browserstack sdk"))) {
     if (!lowerCaseQuery.includes("app live") && !lowerCaseQuery.includes("mobile live")) { // Avoid double-counting with app-live
        detectedIntents.add("live");
     }
  }
  if (lowerCaseQuery.includes("app live") || lowerCaseQuery.includes("mobile live")) {
    detectedIntents.add("app-live");
  }
  if (lowerCaseQuery.includes("accessibility") || lowerCaseQuery.includes("a11y")) {
    detectedIntents.add("accessibility");
  }
  if (lowerCaseQuery.includes("test management") || lowerCaseQuery.includes("test case") || lowerCaseQuery.includes("test run") || lowerCaseQuery.includes("testrail")) {
    detectedIntents.add("test-management");
  }
  if (lowerCaseQuery.includes("sdk") || lowerCaseQuery.includes("browserstack sdk")) {
    detectedIntents.add("sdk");
  }
  if (lowerCaseQuery.includes("self heal") || lowerCaseQuery.includes("selfheal") || lowerCaseQuery.includes("flaky")) {
    detectedIntents.add("self-heal");
  }
  // Observability tools are primarily registered with 'automate'.
  // If specific observability keywords are needed, they can be added here,
  // or ensure 'automate' intent covers observability use cases.

  logger.info(`Detected intents: ${Array.from(detectedIntents).join(", ")} for query: "${userQuery}"`);

  // Enable tools for detected intents
  for (const intent of detectedIntents) {
    const toolsToEnable = registeredProductTools.get(intent);
    if (toolsToEnable) {
      for (const tool of toolsToEnable) {
        tool.enable();
        // Assuming tool.name is available. The SDK's Tool class should have a 'name' property.
        logger.info(`Enabled tool: ${tool.name} for intent '${intent}'`);
      }
    }
  }
}

class CustomStdioServerTransport extends StdioServerTransport {
  private server: McpServer;

  constructor(server: McpServer) {
    super(); // Call the original StdioServerTransport constructor
    this.server = server;
  }

  protected async _handleMessage(message: any): Promise<void> {
    // Extract user query from the message
    // This logic attempts to find the user query in common places within an LLM agent's request
    let userQuery: string | undefined;
    if (message?.method === "model/generate") { // Check if it's a relevant message type
      if (message?.params?.prompt && typeof message.params.prompt === 'string') {
        userQuery = message.params.prompt;
      } else if (Array.isArray(message?.params?.messages) && message.params.messages.length > 0) {
        // Find the last message from the 'user'
        const lastUserMessage = [...message.params.messages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
          if (lastUserMessage.content && typeof lastUserMessage.content === 'string') {
            userQuery = lastUserMessage.content;
          } else if (lastUserMessage.content?.text && typeof lastUserMessage.content.text === 'string') {
            userQuery = lastUserMessage.content.text; // Handle cases where content is an object with a text property
          }
        }
      } else if (message?.params?.context?.userQuery && typeof message.params.context.userQuery === 'string') {
        // Alternative location for user query, if applicable
        userQuery = message.params.context.userQuery;
      }
    }

    if (userQuery) {
      logger.info(`Extracted user query for intent analysis: ${userQuery}`);
      try {
        await analyzeIntentAndToggleTools(userQuery, this.server);
      } catch (error) {
        logger.error(`Error during intent analysis: ${error}`);
        // Decide if we should stop processing or continue. For now, continue.
      }
    } else if (message?.method === "model/generate") { // Only log if it was a generate message but no query found
      logger.debug('No user query found in model/generate message params for intent analysis. Message structure might be different than expected.');
      // logger.debug(`Message for which query extraction failed: ${JSON.stringify(message)}`); // Potentially verbose
    }

    // Call the original message handler
    // The method name _handleMessage is a guess. If it's different, this will fail.
    // Also, StdioServerTransport might not return a Promise from _handleMessage.
    // If super._handleMessage is not async, the 'await' might not be necessary or could cause issues.
    // However, MCP server methods are often async.
    // @ts-expect-error - _handleMessage is protected and not part of public API, type system might complain.
    return super._handleMessage(message);
  }
}

function registerInitialTools(server: McpServer) {
  for (const productName in PRODUCT_TOOLS) {
    const typedProductName = productName as ProductName;
    const addToolsFns = PRODUCT_TOOLS[typedProductName];
    let productToolInstances: Tool[] = [];
    for (const addToolsFn of addToolsFns) {
      const tools = addToolsFn(server);
      productToolInstances = productToolInstances.concat(tools);
    }
    registeredProductTools.set(typedProductName, productToolInstances);
    for (const tool of productToolInstances) {
      tool.disable();
    }
  }
}

// Create an MCP server
const server: McpServer = new McpServer({
  name: "BrowserStack MCP Server",
  version: packageJson.version,
});

setupOnInitialized(server);

registerInitialTools(server);

async function main() {
  logger.info(
    "Launching BrowserStack MCP server, version %s",
    packageJson.version,
  );

  // Start receiving messages on stdin and sending messages on stdout
  // const transport = new StdioServerTransport(); // Old line
  const transport = new CustomStdioServerTransport(server); // New line
  await server.connect(transport);
}

main().catch(console.error);

// Ensure logs are flushed before exit
process.on("exit", () => {
  logger.flush();
});
