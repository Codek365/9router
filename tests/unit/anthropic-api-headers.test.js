// The built-in `anthropic` provider serves Console API keys (sk-ant-api…/sk-ant-usr…).
// Sending `anthropic-beta: claude-code-20250219` with such a key makes Anthropic
// answer 400 "Your credit balance is too low" although the same key works
// without that beta, so the provider must never send it.
import { describe, it, expect } from "vitest";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

const creds = { apiKey: "sk-ant-api03-test" };

describe("anthropic provider headers", () => {
  const ex = new DefaultExecutor("anthropic");

  it("targets the official messages endpoint", () => {
    expect(ex.buildUrl("claude-opus-5-5", true, 0, creds)).toBe("https://api.anthropic.com/v1/messages");
  });

  it("sends x-api-key without the claude-code beta", () => {
    const h = ex.buildHeaders(creds, true, null, "claude-opus-5-5");
    const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
    expect(lower["x-api-key"]).toBe(creds.apiKey);
    expect(lower["anthropic-version"]).toBe("2023-06-01");
    expect(lower["anthropic-beta"] || "").not.toContain("claude-code-20250219");
  });

  it("keeps client-supplied betas", () => {
    const h = ex.buildHeaders({ ...creds, rawHeaders: { "anthropic-beta": "context-management-2025-06-27" } }, true, null, "claude-opus-5-5");
    expect(h["Anthropic-Beta"]).toContain("context-management-2025-06-27");
  });
});

import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { CLAUDE_SYSTEM_PROMPT } from "../../open-sse/config/appConstants.js";

const node = "anthropic-compatible-test";
const official = { apiKey: "sk-ant-api03-test", providerSpecificData: { baseUrl: "https://api.anthropic.com/v1" } };
const gateway = { apiKey: "sk-gw", providerSpecificData: { baseUrl: "https://gw.example.com/v1" } };
const lowerHeaders = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

describe("anthropic-compatible node pointing at api.anthropic.com with an API key", () => {
  it("drops the claude-code beta (lowercase official base URL)", () => {
    const h = lowerHeaders(new DefaultExecutor(node).buildHeaders(official, true, null, "claude-opus-5-5"));
    expect(h["anthropic-beta"] || "").not.toContain("claude-code-20250219");
    expect(h["x-api-key"]).toBe(official.apiKey);
    expect(h["authorization"]).toBeUndefined();
  });

  it("leaves OAuth tokens on the official host untouched", () => {
    const oauth = { accessToken: "sk-ant-oat01-x", providerSpecificData: official.providerSpecificData };
    const h = lowerHeaders(new DefaultExecutor(node).buildHeaders(oauth, true, null, "claude-opus-5-5"));
    expect(h["anthropic-beta"]).toContain("claude-code-20250219");
  });
});

describe("Claude Code system prompt", () => {
  const body = { model: "claude-opus-5-5", messages: [{ role: "user", content: "hi" }] };
  const sys = (provider, creds) =>
    JSON.stringify(translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, "claude-opus-5-5", structuredClone(body), false, creds, provider).system || []);

  it("is removed for the anthropic provider", () => {
    expect(sys("anthropic", creds)).not.toContain(CLAUDE_SYSTEM_PROMPT);
  });
  it("is removed for an official anthropic-compatible node", () => {
    expect(sys(node, official)).not.toContain(CLAUDE_SYSTEM_PROMPT);
  });
  it("is kept for third-party gateways", () => {
    expect(sys(node, gateway)).toContain(CLAUDE_SYSTEM_PROMPT);
  });
});
