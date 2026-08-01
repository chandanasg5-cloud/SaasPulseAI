import { api } from "encore.dev/api";
import { chatStream, type ChatMessage } from "./agent";
import { geminiModelClient } from "./gemini";
import { runChatTool } from "./chatTools";

const MAX_BODY_BYTES = 64 * 1024;

async function readJsonBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += (c as Buffer).length;
    if (total > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function sseInit(resp: any): void {
  resp.setHeader("Content-Type", "text/event-stream");
  resp.setHeader("Cache-Control", "no-cache");
}

function sseSend(resp: any, event: Record<string, unknown>): void {
  resp.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function parseMessages(body: any): ChatMessage[] | null {
  if (!Array.isArray(body?.messages) || body.messages.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const m of body.messages) {
    if ((m?.role !== "user" && m?.role !== "model") || typeof m?.text !== "string" || m.text.trim() === "") {
      return null;
    }
    messages.push({ role: m.role, text: m.text });
  }
  return messages.at(-1)?.role === "user" ? messages : null;
}

// Chat over SSE via api.raw (no generated client needed). The client POSTs
// {messages:[{role,text}...]} and receives typed events, one JSON object per
// `data:` line: step | text | error | done.
export const chat = api.raw(
  { expose: true, method: "POST", path: "/chat" },
  async (req, resp) => {
    sseInit(resp);
    try {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch {
        sseSend(resp, { type: "error", message: "Invalid request body." });
        return;
      }
      const messages = parseMessages(body);
      if (!messages) {
        sseSend(resp, { type: "error", message: "Body must be {messages:[{role,text}...]} ending with a user message." });
        return;
      }
      for await (const event of chatStream(messages, geminiModelClient(), runChatTool)) {
        sseSend(resp, event);
      }
    } catch (err) {
      console.error("chat stream failed:", err);
      sseSend(resp, { type: "error", message: "Sorry, an error occurred while generating the answer." });
    } finally {
      sseSend(resp, { type: "done" });
      resp.end();
    }
  },
);
