import { McpServer, Tool } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  analyzeIntentAndToggleTools,
  registeredProductTools,
  ProductName,
} from "../src/index"; // Adjust path as needed
import logger from "../src/logger"; // Adjust path as needed

// Mock the logger
jest.mock("../src/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  flush: jest.fn(), // if used
}));

// Helper function to create mock tools
const createMockTool = (name: string): Tool => ({
  name,
  description: `Mock tool ${name}`,
  inputSchema: {},
  outputSchema: {},
  execute: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(false), // Default to false, can be overridden per tool
  // Add any other properties/methods the Tool type might have, e.g. from McpServer.tool()
  // For this test, enable, disable, and name are most important.
  // The actual Tool object from SDK might be more complex.
} as any); // Using 'as any' for simplicity if Tool interface is complex

// Mock McpServer - not heavily used by the function itself, just passed through
const mockMcpServer: McpServer = {} as McpServer;

describe("analyzeIntentAndToggleTools", () => {
  let mockAutomateTool1: Tool;
  let mockAutomateTool2: Tool;
  let mockLiveTool1: Tool;
  let mockAppAutomateTool1: Tool;
  let mockSdkTool1: Tool;

  beforeEach(() => {
    // Clear the actual map imported from src/index.ts
    registeredProductTools.clear();
    jest.clearAllMocks(); // Clears all mocks (logger.info, tool.enable/disable)

    // Initialize mock tools for common use
    mockAutomateTool1 = createMockTool("automateTool1");
    mockAutomateTool2 = createMockTool("automateTool2");
    mockLiveTool1 = createMockTool("liveTool1");
    mockAppAutomateTool1 = createMockTool("appAutomateTool1");
    mockSdkTool1 = createMockTool("sdkTool1");
  });

  test("enables 'automate' tools for automate query and disables others", async () => {
    registeredProductTools.set("automate", [mockAutomateTool1, mockAutomateTool2]);
    registeredProductTools.set("live", [mockLiveTool1]);

    await analyzeIntentAndToggleTools("run an automate session", mockMcpServer);

    expect(mockAutomateTool1.enable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool2.enable).toHaveBeenCalledTimes(1);
    expect(mockLiveTool1.enable).not.toHaveBeenCalled();

    // All tools initially get disable() called
    expect(mockAutomateTool1.disable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool2.disable).toHaveBeenCalledTimes(1);
    expect(mockLiveTool1.disable).toHaveBeenCalledTimes(1);


    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: automateTool1 for intent 'automate'"));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: automateTool2 for intent 'automate'"));
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("liveTool1"));
  });

  test("enables 'live' tools for live query and disables others", async () => {
    registeredProductTools.set("automate", [mockAutomateTool1]);
    registeredProductTools.set("live", [mockLiveTool1]);

    await analyzeIntentAndToggleTools("start a live browser", mockMcpServer);

    expect(mockLiveTool1.enable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool1.enable).not.toHaveBeenCalled();

    expect(mockLiveTool1.disable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool1.disable).toHaveBeenCalledTimes(1);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: liveTool1 for intent 'live'"));
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("automateTool1"));
  });

  test("enables 'app-automate' tools for mobile app query", async () => {
    registeredProductTools.set("app-automate", [mockAppAutomateTool1]);
    registeredProductTools.set("automate", [mockAutomateTool1]);


    await analyzeIntentAndToggleTools("test my mobile app", mockMcpServer);

    expect(mockAppAutomateTool1.enable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool1.enable).not.toHaveBeenCalled(); // Should not enable general automate

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: appAutomateTool1 for intent 'app-automate'"));
  });

  test("disables all tools if query has no relevant keywords", async () => {
    registeredProductTools.set("automate", [mockAutomateTool1]);
    registeredProductTools.set("live", [mockLiveTool1]);

    await analyzeIntentAndToggleTools("hello world", mockMcpServer);

    expect(mockAutomateTool1.enable).not.toHaveBeenCalled();
    expect(mockLiveTool1.enable).not.toHaveBeenCalled();

    expect(mockAutomateTool1.disable).toHaveBeenCalledTimes(1);
    expect(mockLiveTool1.disable).toHaveBeenCalledTimes(1);

    // logger.info for enabling tools should not be called
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("Enabled tool:"));
    // It will log the "Detected intents: " message, which is fine.
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Detected intents:  for query: \"hello world\""));
  });

  test("enables 'sdk' tools for BrowserStack SDK query", async () => {
    registeredProductTools.set("sdk", [mockSdkTool1]);
    registeredProductTools.set("automate", [mockAutomateTool1]);

    await analyzeIntentAndToggleTools("how do I use the browserstack sdk?", mockMcpServer);

    expect(mockSdkTool1.enable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool1.enable).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: sdkTool1 for intent 'sdk'"));
  });

  describe("intent detection specificity", () => {
    beforeEach(() => {
        registeredProductTools.set("automate", [mockAutomateTool1]);
        registeredProductTools.set("app-automate", [mockAppAutomateTool1]);
    });

    test("query 'test this android app' enables 'app-automate' but not 'automate'", async () => {
      await analyzeIntentAndToggleTools("test this android app", mockMcpServer);

      expect(mockAppAutomateTool1.enable).toHaveBeenCalledTimes(1);
      expect(mockAutomateTool1.enable).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: appAutomateTool1 for intent 'app-automate'"));
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("automateTool1"));
    });

    test("query 'run web test' enables 'automate' but not 'app-automate'", async () => {
      await analyzeIntentAndToggleTools("run web test", mockMcpServer);

      expect(mockAutomateTool1.enable).toHaveBeenCalledTimes(1);
      expect(mockAppAutomateTool1.enable).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Enabled tool: automateTool1 for intent 'automate'"));
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("appAutomateTool1"));
    });
  });

  test("handles product intent with no tools registered without errors", async () => {
    // No tools registered for "accessibility" in registeredProductTools for this test

    // Ensure 'automate' tools are there to check they get disabled
    registeredProductTools.set("automate", [mockAutomateTool1]);

    await expect(
      analyzeIntentAndToggleTools("check website accessibility", mockMcpServer)
    ).resolves.toBeUndefined(); // Function should complete without throwing

    // automate tools should still be disabled
    expect(mockAutomateTool1.disable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool1.enable).not.toHaveBeenCalled();

    // logger.info for enabling tools should not be called for 'accessibility'
    // as no tools are registered for it.
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("intent 'accessibility'"));
    // It will log the detected intent for accessibility
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Detected intents: accessibility for query: \"check website accessibility\""));
  });

  test("disables tools from previously enabled products if current query doesn't match them", async () => {
    registeredProductTools.set("automate", [mockAutomateTool1]);
    registeredProductTools.set("live", [mockLiveTool1]);

    // First call: enable automate tools
    await analyzeIntentAndToggleTools("run an automate test", mockMcpServer);
    expect(mockAutomateTool1.enable).toHaveBeenCalledTimes(1);
    expect(mockLiveTool1.enable).not.toHaveBeenCalled(); // live is not enabled

    // Clear mocks for the next call, but registeredProductTools still has tools
    // and their internal mock 'enable'/'disable' functions retain their call counts if not reset.
    // For this test, we want to see disable being called again.
    // jest.clearAllMocks() in beforeEach handles resetting call counts for fresh test.
    // Here we are testing sequential calls *within the same conceptual "session"* for the function.
    // The function itself calls disable() on all tools at its start.

    // Reset enable/disable mocks specifically for this multi-stage test
    mockAutomateTool1.enable.mockClear();
    mockAutomateTool1.disable.mockClear();
    mockLiveTool1.enable.mockClear();
    mockLiveTool1.disable.mockClear();


    // Second call: should enable live tools and disable automate tools
    await analyzeIntentAndToggleTools("start a live session", mockMcpServer);

    expect(mockLiveTool1.enable).toHaveBeenCalledTimes(1);
    expect(mockAutomateTool1.enable).not.toHaveBeenCalled(); // automate should not be re-enabled

    // Crucially, automateTool1.disable() should be called again at the start of the second call
    expect(mockAutomateTool1.disable).toHaveBeenCalledTimes(1);
    expect(mockLiveTool1.disable).toHaveBeenCalledTimes(1); // liveTool1 also gets disable called before enable
  });

});
