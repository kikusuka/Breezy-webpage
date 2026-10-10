import { describe, expect, it } from "vitest";
import { createSSEParser, type SSEEvent } from "../sse";

const run = (chunks: string[], flush = true) => {
  const ev: SSEEvent[] = [];
  const p = createSSEParser((e) => ev.push(e));
  chunks.forEach((c) => p.push(c));
  if (flush) p.flush();
  return ev;
};
const line = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe("SSE parser", () => {
  it("parses deltas and ignores [DONE]", () => {
    const ev = run([line({ choices: [{ delta: { content: "Hi" } }] }), "data: [DONE]\n\n"]);
    expect(ev).toEqual([{ type: "delta", text: "Hi" }]);
  });
  it("handles a JSON line split across chunks", () => {
    const full = line({ choices: [{ delta: { content: "split" } }] });
    const ev = run([full.slice(0, 15), full.slice(15, 31), full.slice(31)]);
    expect(ev).toEqual([{ type: "delta", text: "split" }]);
  });
  it("handles CRLF line endings", () => {
    const ev = run(['data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n']);
    expect(ev).toEqual([{ type: "delta", text: "a" }]);
  });
  it("keeps a final line with no trailing newline only after flush", () => {
    const l = 'data: {"choices":[{"delta":{"content":"end"}}]}';
    expect(run([l], false)).toEqual([]);
    expect(run([l], true)).toEqual([{ type: "delta", text: "end" }]);
  });
  it("reads usage, including the Groq variant", () => {
    const a = run([line({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } })]);
    const b = run([line({ x_groq: { usage: { prompt_tokens: 1, completion_tokens: 2 } } })]);
    expect(a).toEqual([{ type: "usage", usage: { prompt: 3, completion: 4 } }]);
    expect(b).toEqual([{ type: "usage", usage: { prompt: 1, completion: 2 } }]);
  });
  it("reports malformed JSON instead of throwing", () => {
    expect(run(["data: {not json\n\n"])).toEqual([{ type: "malformed" }]);
  });
  it("surfaces an error object sent mid-stream", () => {
    expect(run([line({ error: { message: "rate limited" } })])).toEqual([{ type: "error", message: "rate limited" }]);
  });
  it("ignores comments and non-data lines", () => {
    expect(run([": keep-alive\n\nevent: ping\n\n"])).toEqual([]);
  });
});
