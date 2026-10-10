import { useEffect, useRef, useState } from "react";
import type { NavItem, Prefs, Provider, RoleKey, Usage, View } from "./types";
import { ThrottledWriter, loadJSON } from "./storage";
import { createSSEParser } from "./sse";
import { checkBaseUrl } from "./validate";
import { isLocal } from "./net";
export { isLocal };

export const MAIN_NAV: NavItem[] = [
  { id: "chat", label: "Chat", icon: "chat_bubble" },
  { id: "research", label: "Research", icon: "psychology" },
  { id: "history", label: "History", icon: "history" },
  { id: "models", label: "Models", icon: "hub" },
  { id: "docs", label: "Docs", icon: "menu_book" },
  { id: "settings", label: "Settings", icon: "settings" },
];
export const LAB_NAV: NavItem[] = [
  { id: "build", label: "Build", icon: "terminal" },
  { id: "canvas", label: "Canvas", icon: "draw" },
];
export const TABS: NavItem[] = [MAIN_NAV[0], MAIN_NAV[1], MAIN_NAV[3], MAIN_NAV[4], MAIN_NAV[5]];
export const TITLES: Record<View, string> = {
  chat: "Chat", research: "Research", history: "History", models: "Models",
  docs: "Docs", settings: "Settings", build: "Build", canvas: "Canvas",
};

export const PRESETS = [
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", needsKey: true },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", needsKey: true },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", needsKey: true },
  { id: "sambanova", label: "SambaNova", baseUrl: "https://api.sambanova.ai/v1", needsKey: true },
  { id: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", needsKey: false },
  { id: "custom", label: "Custom OpenAI-compatible", baseUrl: "", needsKey: false },
];

export const LS = {
  providers: "breezy.providers",
  active: "breezy.active",
  convs: "breezy.convs",
  runs: "breezy.runs",
  roles: "breezy.roles",
  prefs: "breezy.prefs",
};

export const DEFAULT_PREFS: Prefs = { showMeta: true, enterToSend: true };

export const ROLE_LABEL: Record<RoleKey, string> = {
  solo: "Solo", analyst: "Analyst", critic: "Critic", synth: "Synthesizer",
};
export const ROLE_HINT: Record<RoleKey, string> = {
  solo: "Answers the question directly in one pass.",
  analyst: "Breaks the question down and states findings and assumptions.",
  critic: "Challenges the Analyst: gaps, weak claims, missing cases.",
  synth: "Reconciles both into a final answer with open questions.",
};

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

export function useStore<T>(
  key: string,
  init: T,
  opts?: { fix?: (v: T) => T; toStored?: (v: T) => unknown }
) {
  const [v, setV] = useState<T>(() => loadJSON<T>(key, init, opts?.fix));
  const writer = useRef<ThrottledWriter<T> | null>(null);
  if (!writer.current) writer.current = new ThrottledWriter<T>(key, 1000, opts?.toStored);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    writer.current!.set(v);
  }, [v]);
  useEffect(() => {
    const flush = () => writer.current?.flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);
  return [v, setV] as const;
}

export const usable = (p?: Provider | null): p is Provider => !!p && !!p.baseUrl && !!p.model;

export const fmtUsage = (u?: Usage) =>
  u && (u.prompt != null || u.completion != null)
    ? `${u.prompt ?? "?"} in / ${u.completion ?? "?"} out`
    : "Not reported";

export const fmtMs = (ms?: number) =>
  ms == null ? "Unknown" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

export function fmtWhen(t?: number) {
  if (!t) return "Unknown";
  const d = new Date(t);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return same ? `Today, ${time}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

export function friendlyError(e: any) {
  const m = String(e?.message ?? e);
  if (m.includes("Failed to fetch") || m.includes("NetworkError") || m.includes("Load failed"))
    return "Network or CORS error. Check the endpoint URL. For Ollama, start it with OLLAMA_ORIGINS set to allow this site.";
  return m;
}

/* ───────────── Provider API (OpenAI-compatible) ───────────── */

/** Removes the API key (and any Bearer token) from text before it can reach the UI or a log. */
export function redact(text: string, key?: string) {
  let t = text.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  if (key && key.length >= 6) t = t.split(key).join("[redacted]");
  return t;
}

function headers(p: Provider) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  return h;
}

export const TEST_TIMEOUT_MS = 15000;
export const IDLE_TIMEOUT_MS = 60000;

export async function testProvider(p: Provider): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const chk = checkBaseUrl(p.baseUrl);
  if (!chk.ok) return { ok: false, models: [], error: chk.error };
  try {
    const res = await fetch(p.baseUrl.trim().replace(/\/+$/, "") + "/models", {
      headers: headers(p),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}. Check the key and endpoint.` };
    const j = await res.json();
    const raw = j?.data ?? j?.models;
    if (!Array.isArray(raw)) return { ok: false, models: [], error: "The endpoint answered, but not with a model list." };
    const list: string[] = raw.map((m: any) => String(m?.id ?? m?.name ?? "")).filter(Boolean).sort();
    return { ok: true, models: list };
  } catch (e: any) {
    if (e?.name === "TimeoutError") return { ok: false, models: [], error: `No answer within ${TEST_TIMEOUT_MS / 1000} s.` };
    return { ok: false, models: [], error: redact(friendlyError(e), p.apiKey) };
  }
}

export async function streamChat(
  p: Provider,
  messages: { role: string; content: string }[],
  onDelta: (t: string) => void,
  signal: AbortSignal,
  idleMs = IDLE_TIMEOUT_MS
): Promise<{ ms: number; usage?: Usage }> {
  const chk = checkBaseUrl(p.baseUrl);
  if (!chk.ok) throw new Error(chk.error);
  const t0 = performance.now();
  const url = p.baseUrl.trim().replace(/\/+$/, "") + "/chat/completions";

  // Cancellation: user abort and an idle timeout both go through one controller.
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal.aborted) ctl.abort();
  else signal.addEventListener("abort", onAbort);
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; ctl.abort(); }, idleMs);
  };

  const post = (withUsage: boolean) =>
    fetch(url, {
      method: "POST",
      signal: ctl.signal,
      headers: headers(p),
      body: JSON.stringify({
        model: p.model,
        messages,
        stream: true,
        ...(withUsage ? { stream_options: { include_usage: true } } : {}),
      }),
    });

  try {
    arm();
    // Asks for token usage. Some providers reject stream_options, so retry once without it.
    let res = await post(true);
    if (res.status === 400 || res.status === 422) res = await post(false);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(redact(`HTTP ${res.status}. ${t.slice(0, 240)}`, p.apiKey));
    }
    if (!res.body) throw new Error("No response stream from provider.");

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let usage: Usage | undefined;
    let streamError: string | null = null;
    let malformed = 0;
    let gotDelta = false;
    const parser = createSSEParser((e) => {
      if (e.type === "delta") { gotDelta = true; onDelta(e.text); }
      else if (e.type === "usage") usage = e.usage;
      else if (e.type === "error") streamError = e.message;
      else malformed++;
    });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parser.push(dec.decode(value, { stream: true }));
      if (streamError) throw new Error(redact(`Provider error mid-stream: ${streamError}`, p.apiKey));
    }
    parser.push(dec.decode());
    parser.flush();
    if (streamError) throw new Error(redact(`Provider error mid-stream: ${streamError}`, p.apiKey));
    if (!gotDelta && malformed > 0) throw new Error("The provider sent a response Breezy couldn't read as an OpenAI-style stream.");
    return { ms: Math.round(performance.now() - t0), usage };
  } catch (e: any) {
    if (timedOut) throw new Error(`No data from the provider for ${Math.round(idleMs / 1000)} s. Request cancelled.`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export function storageBytes() {
  let n = 0;
  try {
    for (const k of Object.values(LS)) n += (localStorage.getItem(k) ?? "").length * 2;
  } catch {}
  return n;
}
export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
