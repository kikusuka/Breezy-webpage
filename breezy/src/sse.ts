import type { Usage } from "./types";

export type SSEEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string }
  | { type: "malformed" };

/** Incremental parser for OpenAI-style SSE streams. Safe across arbitrary chunk splits. */
export function createSSEParser(onEvent: (e: SSEEvent) => void) {
  let buf = "";

  const handle = (raw: string) => {
    const l = raw.trim();
    if (!l.startsWith("data:")) return;
    const d = l.slice(5).trim();
    if (!d || d === "[DONE]") return;
    let j: any;
    try {
      j = JSON.parse(d);
    } catch {
      onEvent({ type: "malformed" });
      return;
    }
    if (j?.error) {
      const m = typeof j.error === "string" ? j.error : j.error.message ?? "Provider reported an error mid-stream.";
      onEvent({ type: "error", message: String(m) });
      return;
    }
    const text = j?.choices?.[0]?.delta?.content;
    if (typeof text === "string" && text) onEvent({ type: "delta", text });
    const u = j?.usage ?? j?.x_groq?.usage;
    if (u && (u.prompt_tokens != null || u.completion_tokens != null))
      onEvent({ type: "usage", usage: { prompt: u.prompt_tokens, completion: u.completion_tokens } });
  };

  return {
    push(chunk: string) {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) handle(line);
    },
    /** Call when the stream ends so a final line without a trailing newline is not lost. */
    flush() {
      if (buf) handle(buf);
      buf = "";
    },
  };
}
