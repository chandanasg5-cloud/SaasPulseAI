import { describe, it, expect } from "vitest";
import { parseMessages, chat } from "./chat";
import { chatStream, type ChatMessage } from "./agent";
import { geminiModelClient } from "./gemini";
import { runChatTool } from "./chatTools";
import { ensureSeeded } from "./seed";

describe("parseMessages", () => {
  it("accepts a valid message list ending in a user message", () => {
    expect(parseMessages({ messages: [{ role: "user", text: "hi" }] })).toEqual([{ role: "user", text: "hi" }]);
  });

  it("rejects a missing messages array", () => {
    expect(parseMessages({})).toBeNull();
  });

  it("rejects an empty messages array", () => {
    expect(parseMessages({ messages: [] })).toBeNull();
  });

  it("rejects a message list ending in a model message", () => {
    const result = parseMessages({ messages: [{ role: "user", text: "hi" }, { role: "model", text: "hello" }] });
    expect(result).toBeNull();
  });

  it("rejects a message with an empty text field", () => {
    expect(parseMessages({ messages: [{ role: "user", text: "   " }] })).toBeNull();
  });
});

// Gated: only runs with RUN_GEMINI_TESTS=1, since these hit the real Gemini API
// and Gemini's free tier is rate-limited (~20 requests/day/model).
describe.skipIf(!process.env.RUN_GEMINI_TESTS)("chat end-to-end (real Gemini)", () => {
  it("answers a single-tool-call question with real data, grounded in a tool result", async () => {
    await ensureSeeded();
    const history: ChatMessage[] = [{ role: "user", text: "What is our current MRR?" }];
    const events = [];
    for await (const e of chatStream(history, geminiModelClient(), runChatTool)) events.push(e);

    const steps = events.filter((e) => e.type === "step");
    const textEvents = events.filter((e) => e.type === "text");
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    const fullAnswer = textEvents.map((e) => (e as { text: string }).text).join("");
    expect(fullAnswer.length).toBeGreaterThan(0);
  }, 30000);

  it("answers a question plausibly requiring multiple different tool calls", async () => {
    await ensureSeeded();
    const history: ChatMessage[] = [
      { role: "user", text: "Give me our top 3 churn risks and our customer segment breakdown." },
    ];
    const events = [];
    for await (const e of chatStream(history, geminiModelClient(), runChatTool)) events.push(e);

    const steps = events.filter((e) => e.type === "step");
    const textEvents = events.filter((e) => e.type === "text");
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    const fullAnswer = textEvents.map((e) => (e as { text: string }).text).join("");
    expect(fullAnswer.length).toBeGreaterThan(0);
  }, 30000);
});
