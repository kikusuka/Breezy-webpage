export type View =
  | "chat" | "research" | "history" | "models"
  | "docs" | "settings" | "build" | "canvas";

export type Usage = { prompt?: number; completion?: number };

export type Provider = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  status: "untested" | "testing" | "ok" | "error";
  error?: string;
  testedAt?: number;
  /** Key is written to localStorage only when true. Otherwise it lives in memory until reload. */
  rememberKey?: boolean;
};

export type Msg = {
  role: "user" | "assistant";
  content: string;
  via?: string;
  model?: string;
  ms?: number;
  usage?: Usage;
  error?: string;
  at?: number;
};

export type Conv = { id: string; title: string; updated: number; messages: Msg[] };

export type Step = {
  /** Role key and provider id let a failed step be retried. Absent on runs saved by older versions. */
  key?: RoleKey;
  providerId?: string;
  /** True once the request for this step was actually sent. */
  ran?: boolean;
  role: string;
  via: string;
  model: string;
  local: boolean;
  content: string;
  status: "pending" | "running" | "done" | "error" | "stopped";
  ms?: number;
  usage?: Usage;
  error?: string;
};

export type Run = {
  id: string;
  question: string;
  mode: "solo" | "trio";
  steps: Step[];
  updated: number;
};

export type RoleKey = "solo" | "analyst" | "critic" | "synth";
export type RoleAssign = { providerId: string; model: string };
export type Roles = Partial<Record<RoleKey, RoleAssign>>;

export type Prefs = { showMeta: boolean; enterToSend: boolean };

export type NavItem = { id: View; label: string; icon: string };
