import type { Run, Step } from "./types";

/** Outputs of finished steps before `from`. Partial or failed output is never used as a result. */
export function outputsBefore(run: Run, from: number): string[] {
  return run.steps.slice(0, from).filter((s) => s.status === "done").map((s) => s.content);
}

/** A step can be retried when it failed or was stopped, every earlier step finished, and it has what it needs to re-run. */
export function canRetry(run: Run, i: number, busy: boolean): boolean {
  const s = run.steps[i];
  if (busy || !s || !s.key || !s.providerId) return false;
  if (s.status !== "error" && s.status !== "stopped") return false;
  return run.steps.slice(0, i).every((x) => x.status === "done");
}

/** Resets the step at `from` and everything after it to a clean pending state. */
export function resetFrom(run: Run, from: number): Run {
  const steps: Step[] = run.steps.map((s, i) =>
    i < from ? s : { ...s, status: "pending", content: "", error: undefined, ms: undefined, usage: undefined, ran: false }
  );
  return { ...run, steps, updated: Date.now() };
}
