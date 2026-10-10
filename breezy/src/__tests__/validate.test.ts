import { describe, expect, it } from "vitest";
import { checkBaseUrl } from "../validate";

describe("checkBaseUrl", () => {
  it("rejects empty and malformed input", () => {
    expect(checkBaseUrl("  ").ok).toBe(false);
    expect(checkBaseUrl("api.groq.com/openai/v1").ok).toBe(false);
  });
  it("rejects non-http protocols", () => {
    expect(checkBaseUrl("file:///etc/passwd").ok).toBe(false);
    expect(checkBaseUrl("javascript:alert(1)").ok).toBe(false);
  });
  it("rejects credentials embedded in the URL", () => {
    expect(checkBaseUrl("https://user:pw@host/v1").ok).toBe(false);
  });
  it("accepts https with no warning", () => {
    expect(checkBaseUrl("https://api.groq.com/openai/v1")).toEqual({ ok: true });
  });
  it("accepts local http without warning", () => {
    expect(checkBaseUrl("http://localhost:11434/v1")).toEqual({ ok: true });
  });
  it("accepts remote http but warns", () => {
    const r = checkBaseUrl("http://example.com/v1");
    expect(r.ok && r.warn).toBeTruthy();
  });
});
