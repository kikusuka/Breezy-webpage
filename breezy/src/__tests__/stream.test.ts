import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../types";
import { redact, streamChat, testProvider } from "../lib";

const P: Provider = {
  id: "1", label: "T", baseUrl: "https://api.example.com/v1", apiKey: "sk-secret-1234567890",
  model: "m", models: [], status: "untested",
};
const enc = new TextEncoder();
const body = (chunks: string[], hang = false) =>
  new ReadableStream<Uint8Array>({
    start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); if (!hang) c.close(); },
  });
const resp = (chunks: string[], init: ResponseInit = { status: 200 }, hang = false) =>
  new Response(body(chunks, hang), init);
const d = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("streamChat (mocked fetch, not a real provider)", () => {
  it("streams deltas split across chunks and returns usage", async () => {
    const line = d("Hello");
    vi.stubGlobal("fetch", vi.fn(async () =>
      resp([line.slice(0, 20), line.slice(20), d(" world"),
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } })}\n\n`, "data: [DONE]\n\n"])));
    let out = "";
    const r = await streamChat(P, [{ role: "user", content: "x" }], (t) => (out += t), new AbortController().signal);
    expect(out).toBe("Hello world");
    expect(r.usage).toEqual({ prompt: 5, completion: 2 });
  });
  it("sends the key as a Bearer header and the model in the body", async () => {
    const f = vi.fn(async () => resp([d("a")]));
    vi.stubGlobal("fetch", f);
    await streamChat(P, [{ role: "user", content: "x" }], () => {}, new AbortController().signal);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect((init.headers as any).Authorization).toBe("Bearer sk-secret-1234567890");
    expect(JSON.parse(init.body as string).model).toBe("m");
  });
  it("retries once without stream_options when the provider rejects it", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("unknown field stream_options", { status: 400 }))
      .mockResolvedValueOnce(resp([d("ok")]));
    vi.stubGlobal("fetch", f);
    let out = "";
    await streamChat(P, [], (t) => (out += t), new AbortController().signal);
    expect(out).toBe("ok");
    expect(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string).stream_options).toBeUndefined();
  });
  it("turns HTTP errors into messages that never contain the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`bad key sk-secret-1234567890 / Bearer sk-secret-1234567890`, { status: 401 })));
    const err = await streamChat(P, [], () => {}, new AbortController().signal).catch((e) => e);
    expect(err.message).toContain("HTTP 401");
    expect(err.message).not.toContain("sk-secret");
  });
  it("throws on an error event sent inside the stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp([d("a"), `data: ${JSON.stringify({ error: { message: "overloaded" } })}\n\n`])));
    await expect(streamChat(P, [], () => {}, new AbortController().signal)).rejects.toThrow(/overloaded/);
  });
  it("throws when the body is not an OpenAI-style stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp(["data: <html>oops</html>\n\n"])));
    await expect(streamChat(P, [], () => {}, new AbortController().signal)).rejects.toThrow(/couldn't read/);
  });
  it("rejects an invalid base URL before any request", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await expect(streamChat({ ...P, baseUrl: "file:///x" }, [], () => {}, new AbortController().signal)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it("propagates user cancellation as AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })));
    const ac = new AbortController();
    const p = streamChat(P, [], () => {}, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
  it("times out when the provider goes silent, with a non-abort error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })));
    const p = streamChat(P, [], () => {}, new AbortController().signal, 5000);
    const assertion = expect(p).rejects.toThrow(/No data from the provider/);
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });
});

describe("testProvider (mocked fetch)", () => {
  it("returns a sorted model list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ id: "b" }, { id: "a" }] })));
    expect(await testProvider(P)).toEqual({ ok: true, models: ["a", "b"] });
  });
  it("reports HTTP failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    const r = await testProvider(P);
    expect(r.ok).toBe(false); expect(r.error).toContain("403");
  });
  it("does not call a 200 response without a model list a success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ hello: "world" })));
    expect((await testProvider(P)).ok).toBe(false);
  });
  it("reports malformed JSON without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    const r = await testProvider(P);
    expect(r.ok).toBe(false); expect(JSON.stringify(r)).not.toContain("sk-secret");
  });
});

describe("redact", () => {
  it("removes the key and bearer tokens", () => {
    expect(redact("x sk-secret-1234567890 y Bearer abc.def", "sk-secret-1234567890")).toBe("x [redacted] y Bearer [redacted]");
  });
});
