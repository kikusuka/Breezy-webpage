import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThrottledWriter, clearIssues, getIssues, loadJSON, saveJSON } from "../storage";

beforeEach(() => { localStorage.clear(); clearIssues(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("loadJSON", () => {
  it("returns init when nothing is saved", () => {
    expect(loadJSON("k", [1])).toEqual([1]);
  });
  it("applies the migration function", () => {
    localStorage.setItem("k", JSON.stringify([{ a: 1 }]));
    expect(loadJSON<any[]>("k", [], (v) => v.map((x) => ({ ...x, b: 2 })))).toEqual([{ a: 1, b: 2 }]);
  });
  it("keeps a backup and reports corrupted data instead of losing it silently", () => {
    localStorage.setItem("k", "{broken");
    expect(loadJSON("k", [])).toEqual([]);
    expect(localStorage.getItem("k.corrupt")).toBe("{broken");
    expect(getIssues()[0].kind).toBe("corrupt");
  });
});

describe("saveJSON", () => {
  it("reports quota errors without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const e: any = new Error("full"); e.name = "QuotaExceededError"; throw e;
    });
    expect(saveJSON("k", { big: true })).toBe(false);
    expect(getIssues()[0].kind).toBe("quota");
  });
  it("saves normally", () => {
    expect(saveJSON("k", [1, 2])).toBe(true);
    expect(localStorage.getItem("k")).toBe("[1,2]");
  });
});

describe("ThrottledWriter", () => {
  it("writes once for a burst of updates, with the latest value", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, "setItem");
    const w = new ThrottledWriter<number>("n", 1000);
    for (let i = 1; i <= 200; i++) w.set(i);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("n")).toBe("200");
  });
  it("flush writes immediately and only once", () => {
    vi.useFakeTimers();
    const w = new ThrottledWriter<string>("s", 1000);
    w.set("a"); w.flush(); w.flush();
    expect(localStorage.getItem("s")).toBe('"a"');
  });
  it("applies the toStored transform (used to strip API keys)", () => {
    const w = new ThrottledWriter<{ k: string }[]>("p", 1000, (v) => v.map(() => ({ k: "" })));
    w.set([{ k: "secret" }]); w.flush();
    expect(localStorage.getItem("p")).toBe('[{"k":""}]');
  });
  it("handles a large history without throwing", () => {
    const big = Array.from({ length: 2000 }, (_, i) => ({ id: i, text: "x".repeat(500) }));
    expect(saveJSON("big", big)).toBe(true);
    expect(loadJSON<any[]>("big", []).length).toBe(2000);
  });
});
