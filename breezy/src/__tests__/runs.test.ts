import { describe, expect, it } from "vitest";
import type { Run, Step } from "../types";
import { canRetry, outputsBefore, resetFrom } from "../runs";

const step = (status: Step["status"], over: Partial<Step> = {}): Step => ({
  key: "analyst", providerId: "p1", role: "r", via: "v", model: "m", local: false,
  content: status === "done" ? "OUT" : "partial", status, ...over,
});
const run = (steps: Step[]): Run => ({ id: "r", question: "q", mode: "trio", steps, updated: 0 });

describe("Trio failure and retry", () => {
  it("only feeds finished steps into later prompts", () => {
    const r = run([step("done"), step("error"), step("stopped")]);
    expect(outputsBefore(r, 3)).toEqual(["OUT"]);
  });
  it("allows retry of a failed step when earlier steps are done", () => {
    expect(canRetry(run([step("done"), step("error")]), 1, false)).toBe(true);
  });
  it("blocks retry while a run is active", () => {
    expect(canRetry(run([step("done"), step("error")]), 1, true)).toBe(false);
  });
  it("blocks retry when an earlier step did not finish", () => {
    expect(canRetry(run([step("error"), step("stopped")]), 1, false)).toBe(false);
  });
  it("blocks retry for steps from older saved runs without role/provider info", () => {
    expect(canRetry(run([step("error", { key: undefined, providerId: undefined })]), 0, false)).toBe(false);
  });
  it("does not offer retry on finished steps", () => {
    expect(canRetry(run([step("done")]), 0, false)).toBe(false);
  });
  it("resetFrom keeps finished steps and clears the rest", () => {
    const r = resetFrom(run([step("done"), step("error", { error: "boom", ms: 5 }), step("stopped")]), 1);
    expect(r.steps[0].content).toBe("OUT");
    expect(r.steps[1]).toMatchObject({ status: "pending", content: "", error: undefined, ms: undefined, ran: false });
    expect(r.steps[2].status).toBe("pending");
  });
});
