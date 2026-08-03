"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

type ChatEvent =
  | { type: "step"; tool: string; label: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export default function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setStatus(null);

    const history = [...messagesRef.current, { role: "user" as const, text: question }];
    setMessages(history);

    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-20) }),
    });

    if (!res.body) {
      setMessages([...history, { role: "model", text: "Sorry, no response received." }]);
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let hasAnswer = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event: ChatEvent = JSON.parse(chunk.slice(6));

        if (event.type === "step") {
          setStatus(event.label);
        } else if (event.type === "text") {
          answer += event.text;
          hasAnswer = true;
          setStatus(null);
          setMessages([...history, { role: "model", text: answer }]);
        } else if (event.type === "error") {
          answer = event.message;
          hasAnswer = true;
          setMessages([...history, { role: "model", text: answer }]);
        }
      }
    }

    if (!hasAnswer) {
      setMessages([...history, { role: "model", text: "No answer was returned." }]);
    }
    setStatus(null);
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-3xl font-bold">SaaSPulse AI — Analyst Copilot</h1>

      <div className="space-y-3">
        {messages.map((m, i) => (
          <Card key={i} className={m.role === "user" ? "ml-auto max-w-[80%] bg-primary/5" : "mr-auto max-w-[80%]"}>
            <CardContent className="whitespace-pre-wrap p-3 text-sm">{m.text}</CardContent>
          </Card>
        ))}
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your business..."
          disabled={busy}
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy || !input.trim()}
        >
          Send
        </button>
      </form>
    </main>
  );
}
