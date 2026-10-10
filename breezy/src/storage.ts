export type StoreIssue = { key: string; kind: "quota" | "corrupt" | "unavailable"; message: string };

const issues: StoreIssue[] = [];
const listeners = new Set<() => void>();

function report(i: StoreIssue) {
  issues.push(i);
  listeners.forEach((l) => l());
}
export const getIssues = () => issues.slice();
export const clearIssues = () => { issues.length = 0; listeners.forEach((l) => l()); };
export const subscribeIssues = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

const isQuota = (e: any) =>
  e?.name === "QuotaExceededError" || e?.name === "NS_ERROR_DOM_QUOTA_REACHED" || e?.code === 22 || e?.code === 1014;

/** Loads JSON. On corrupt data it keeps a copy under `<key>.corrupt` instead of silently discarding it. */
export function loadJSON<T>(key: string, init: T, fix?: (v: T) => T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    report({ key, kind: "unavailable", message: "Browser storage is unavailable. Nothing will be saved." });
    return init;
  }
  if (raw == null) return init;
  try {
    const v = JSON.parse(raw) as T;
    return fix ? fix(v) : v;
  } catch {
    let kept = true;
    try { localStorage.setItem(key + ".corrupt", raw); } catch { kept = false; }
    report({
      key, kind: "corrupt",
      message: kept
        ? `Saved data for "${key}" was unreadable. A copy was kept under "${key}.corrupt" and the app started empty.`
        : `Saved data for "${key}" was unreadable and could not be backed up. The app started empty.`,
    });
    return init;
  }
}

export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    report(isQuota(e)
      ? { key, kind: "quota", message: "Browser storage is full. Recent changes are not being saved. Export or delete old chats." }
      : { key, kind: "unavailable", message: "Could not write to browser storage. Recent changes are not being saved." });
    return false;
  }
}

/** Writes at most once per `delay` ms (trailing), so streaming doesn't re-serialize on every token. */
export class ThrottledWriter<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest!: T;
  private dirty = false;
  constructor(private key: string, private delay = 1000, private toStored: (v: T) => unknown = (v) => v) {}
  set(v: T) {
    this.latest = v;
    this.dirty = true;
    if (this.timer == null) this.timer = setTimeout(() => this.flush(), this.delay);
  }
  flush() {
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) return;
    this.dirty = false;
    saveJSON(this.key, this.toStored(this.latest));
  }
}
