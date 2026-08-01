import { describe, it, expect } from "vitest";
import {
  chatStream, MAX_ROUNDS, HISTORY_LIMIT,
  type AgentEvent, type ChatMessage, type GenContent, type ModelClient, type RoundChunk, type ToolRunner,
} from "./agent";

function fakeModel(rounds: RoundChunk[][]): ModelClient & { seen: GenContent[][] } {
  const seen: GenContent[][] = [];
  return {
    seen,
    async *streamRound(contents: GenContent[]) {
      seen.push(structuredClone(contents));
      for (const chunk of rounds.shift() ?? [{ text: "fallback answer" }]) yield chunk;
    },
  };
}

const echoTool: ToolRunner = async (name, args) => `${name}:${JSON.stringify(args)}`;

async function drain(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("chatStream", () => {
  it("streams a plain text answer when the model calls no tools", async () => {
    const model = fakeModel([[{ text: "Hello " }, { text: "there." }]]);
    const events = await drain(chatStream([{ role: "user", text: "hi" }], model, echoTool));
    expect(events).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "there." },
    ]);
    expect(model.seen.length).toBe(1);
  });

  it("runs a tool round-trip: step event, result fed back, final answer", async () => {
    const model = fakeModel([
      [{ functionCalls: [{ name: "get_executive_overview", args: {} }] }],
      [{ text: "MRR is $50,000." }],
    ]);
    const events = await drain(chatStream([{ role: "user", text: "what's our MRR?" }], model, echoTool));
    expect(events[0]).toEqual({ type: "step", tool: "get_executive_overview", label: "Checking executive overview" });
    expect(events[1]).toEqual({ type: "text", text: "MRR is $50,000." });

    const round2 = model.seen[1];
    const flat = JSON.stringify(round2);
    expect(flat).toContain("functionCall");
    expect(flat).toContain("functionResponse");
    expect(flat).toContain("get_executive_overview");
  });

  it("feeds tool-runner exceptions back to the model as error output instead of throwing", async () => {
    const failingTool: ToolRunner = async () => {
      throw new Error("boom");
    };
    const model = fakeModel([
      [{ functionCalls: [{ name: "get_company_profile", args: { company_name: "Acme" } }] }],
      [{ text: "I couldn't look that up." }],
    ]);
    const events = await drain(chatStream([{ role: "user", text: "tell me about Acme" }], model, failingTool));
    expect(events.at(-1)).toEqual({ type: "text", text: "I couldn't look that up." });
    const round2Flat = JSON.stringify(model.seen[1]);
    expect(round2Flat).toContain("Error: tool failed: boom");
  });

  it("stops calling tools on the last round and asks the model to answer now", async () => {
    const rounds: RoundChunk[][] = [];
    for (let i = 0; i < MAX_ROUNDS - 1; i++) {
      rounds.push([{ functionCalls: [{ name: "get_executive_overview", args: {} }] }]);
    }
    rounds.push([{ text: "Final answer from gathered info." }]);
    const model = fakeModel(rounds);
    const events = await drain(chatStream([{ role: "user", text: "loop test" }], model, echoTool));
    expect(events.at(-1)).toEqual({ type: "text", text: "Final answer from gathered info." });
    expect(model.seen.length).toBe(MAX_ROUNDS);
    const lastRoundFlat = JSON.stringify(model.seen[MAX_ROUNDS - 1]);
    expect(lastRoundFlat).toContain("Answer now from the information already gathered");
  });

  it("rejects extra tool calls beyond MAX_CALLS_PER_ROUND with an error response, still processes the first", async () => {
    const model = fakeModel([
      [{ functionCalls: [
        { name: "get_executive_overview", args: {} },
        { name: "get_product_overview", args: {} },
      ] }],
      [{ text: "done" }],
    ]);
    const events = await drain(chatStream([{ role: "user", text: "two things" }], model, echoTool));
    const stepEvents = events.filter((e) => e.type === "step");
    expect(stepEvents).toHaveLength(1);
    expect(stepEvents[0]).toEqual({ type: "step", tool: "get_executive_overview", label: "Checking executive overview" });
    const round2Flat = JSON.stringify(model.seen[1]);
    expect(round2Flat).toContain("too many tool calls");
  });

  it("truncates history to HISTORY_LIMIT and drops a leading model turn the cut exposes", async () => {
    const history: ChatMessage[] = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "model") as "user" | "model",
      text: `msg ${i}`,
    }));
    // slice(-20) of a 21-length array drops index 0 ("user"), leaving index 1 ("model")
    // first, which the code must then also shift off so the sequence starts with "user".
    const model = fakeModel([[{ text: "ok" }]]);
    await drain(chatStream(history, model, echoTool));
    const sent = model.seen[0];
    expect(sent.length).toBe(HISTORY_LIMIT - 1);
    expect(sent[0].role).toBe("user");
  });
});
