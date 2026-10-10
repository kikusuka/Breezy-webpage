import { useState } from "react";
import type { Provider, RoleKey, Roles, Run, Step } from "../types";
import { ROLE_HINT, ROLE_LABEL, fmtMs, fmtUsage, fmtWhen, isLocal } from "../lib";
import { Badge, CopyBtn, Empty, Icon, Spinner } from "../ui";
import { canRetry } from "../runs";

type Props = {
  providers: Provider[];
  provider: Provider | null;
  roles: Roles;
  setRoles: (fn: (r: Roles) => Roles) => void;
  runs: Run[];
  currentRunId: string | null;
  setCurrentRunId: (id: string | null) => void;
  runBusy: boolean;
  resolveRole: (k: RoleKey) => { prov: Provider; model: string } | null;
  onStart: (q: string, mode: "solo" | "trio") => void;
  onStop: () => void;
  onRetry: (runId: string, index: number) => void;
  goModels: () => void;
};

const STEP_BADGE: Record<Step["status"], { tone: "ok" | "err" | "off" | "info"; text: string }> = {
  pending: { tone: "off", text: "Waiting" },
  running: { tone: "info", text: "Running" },
  done: { tone: "ok", text: "Done" },
  error: { tone: "err", text: "Failed" },
  stopped: { tone: "off", text: "Stopped" },
};

function RolePicker({ k, props }: { k: RoleKey; props: Props }) {
  const a = props.roles[k];
  const resolved = props.resolveRole(k);
  const prov = resolved?.prov ?? null;
  const set = (patch: { providerId?: string; model?: string }) =>
    props.setRoles((r) => ({
      ...r,
      [k]: { providerId: a?.providerId ?? prov?.id ?? "", model: a?.model ?? resolved?.model ?? "", ...patch },
    }));
  const models = prov ? (resolved?.model && !prov.models.includes(resolved.model) ? [resolved.model, ...prov.models] : prov.models) : [];

  return (
    <div className="role">
      <div className="role-head">
        <span className="role-name">{ROLE_LABEL[k]}</span>
        {prov && <Badge tone={isLocal(prov.baseUrl) ? "info" : "off"}>{isLocal(prov.baseUrl) ? "Local" : "Cloud"}</Badge>}
      </div>
      <p className="role-hint">{ROLE_HINT[k]}</p>
      <select
        className="input"
        value={prov?.id ?? ""}
        aria-label={ROLE_LABEL[k] + " provider"}
        onChange={(e) => set({ providerId: e.target.value, model: "" })}
      >
        {!prov && <option value="">No provider</option>}
        {props.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {models.length > 0 ? (
        <select
          className="input mono"
          value={resolved?.model ?? ""}
          aria-label={ROLE_LABEL[k] + " model"}
          onChange={(e) => set({ model: e.target.value })}
        >
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      ) : (
        <input
          className="input mono"
          value={a?.model ?? resolved?.model ?? ""}
          placeholder="Model ID"
          aria-label={ROLE_LABEL[k] + " model"}
          onChange={(e) => set({ model: e.target.value })}
        />
      )}
    </div>
  );
}

function StepCard({ s, index, total, retry }: { s: Step; index: number; total: number; retry?: () => void }) {
  const b = s.status === "stopped" && s.ran === false ? { tone: "off" as const, text: "Not run" } : STEP_BADGE[s.status];
  return (
    <article className={"step " + s.status}>
      <div className="step-rail">
        <span className="step-dot">{s.status === "running" ? <Spinner /> : index + 1}</span>
        {index < total - 1 && <span className="step-line" />}
      </div>
      <div className="step-card">
        <header className="step-head">
          <div>
            <h3>{s.role}</h3>
            <div className="step-sub">
              <span>{s.via}</span>
              <span className="mono">{s.model}</span>
              <Badge tone={s.local ? "info" : "off"}>{s.local ? "Local" : "Cloud"}</Badge>
            </div>
          </div>
          <Badge tone={b.tone}>{b.text}</Badge>
        </header>

        {s.status === "pending" && <p className="muted">Starts after the previous step finishes.</p>}
        {s.status === "running" && !s.content && <p className="muted">Request sent. Waiting for the first token.</p>}
        {s.status === "stopped" && s.ran === false && <p className="muted">This step never started.</p>}
        {s.status === "stopped" && s.ran && s.content && <p className="muted small">Stopped early. This is partial output, not a finished result.</p>}
        {s.content && <div className="text">{s.content}</div>}
        {s.error && (
          <div className="inline-error">
            <Icon name="error" />
            <div><strong>This step failed.</strong><span>{s.error}</span></div>
          </div>
        )}
        {retry && (
          <div className="row gap">
            <button className="btn" onClick={retry}><Icon name="refresh" /> Retry this step</button>
            <span className="muted small">Earlier finished steps are kept. Later steps run after it.</span>
          </div>
        )}
        {(s.status === "done" || s.status === "stopped") && s.content && (
          <footer className="step-foot">
            <span>{fmtMs(s.ms)}</span>
            <span>{fmtUsage(s.usage)}</span>
            <div className="grow" />
            <CopyBtn text={s.content} />
          </footer>
        )}
      </div>
    </article>
  );
}

export default function ResearchView(props: Props) {
  const { runs, currentRunId, runBusy } = props;
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"solo" | "trio">("solo");

  const keys: RoleKey[] = mode === "solo" ? ["solo"] : ["analyst", "critic", "synth"];
  const missing = keys.filter((k) => !props.resolveRole(k));
  const run = runs.find((r) => r.id === currentRunId) ?? null;
  const others = runs.filter((r) => r.id !== currentRunId).slice(0, 4);

  const reason =
    props.providers.length === 0 ? "No model configured."
    : missing.length ? `Pick a provider and model for: ${missing.map((k) => ROLE_LABEL[k]).join(", ")}.`
    : !q.trim() ? "Write a question to start." : "";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Research</h1>
        <p>Ask one model, or let three models work in turns: Analyst, Critic, Synthesizer.</p>
      </header>

      <section className="card">
        <div className="row between wrap">
          <div className="seg" role="tablist" aria-label="Mode">
            <button className={mode === "solo" ? "on" : ""} onClick={() => setMode("solo")} disabled={runBusy}>Solo</button>
            <button className={mode === "trio" ? "on" : ""} onClick={() => setMode("trio")} disabled={runBusy}>Trio</button>
          </div>
          <span className="muted small">
            {mode === "solo" ? "1 request" : "3 requests, one after another"}
          </span>
        </div>

        <textarea
          className="input question"
          rows={4}
          value={q}
          disabled={runBusy}
          placeholder="State the question you want investigated"
          onChange={(e) => setQ(e.target.value)}
        />

        {props.providers.length > 0 && (
          <div className={"roles " + (mode === "trio" ? "three" : "one")}>
            {keys.map((k) => <RolePicker key={k} k={k} props={props} />)}
          </div>
        )}

        <div className="notice">
          <Icon name="info" />
          <span>No web search yet. Answers come from the models' own knowledge, and nothing is cited or verified.</span>
        </div>

        <div className="row between wrap run-bar">
          <span className={"muted small" + (reason ? "" : " hidden")}>{reason || "Ready"}</span>
          <div className="row gap">
            {props.providers.length === 0 && (
              <button className="btn" onClick={props.goModels}><Icon name="hub" /> Set up a model</button>
            )}
            {runBusy ? (
              <button className="btn stop" onClick={props.onStop}><Icon name="stop" /> Stop</button>
            ) : (
              <button
                className="btn primary"
                disabled={!!reason}
                onClick={() => { props.onStart(q.trim(), mode); }}
              >
                <Icon name="play_arrow" /> Run {mode === "solo" ? "Solo" : "Trio"}
              </button>
            )}
          </div>
        </div>
      </section>

      {run ? (
        <section className="run">
          <header className="run-head">
            <div>
              <span className="run-kicker">{run.mode === "trio" ? "Trio run" : "Solo run"} · {fmtWhen(run.updated)}</span>
              <h2>{run.question}</h2>
            </div>
          </header>
          <div className="steps">
            {run.steps.map((s, i) => (
              <StepCard
                key={i} s={s} index={i} total={run.steps.length}
                retry={canRetry(run, i, runBusy) ? () => props.onRetry(run.id, i) : undefined}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="card">
          <Empty
            icon="psychology"
            title="No research run open"
            body={runs.length ? "Pick a run below or start a new one." : "Your runs will appear here with every step and the model that wrote it."}
          />
        </div>
      )}

      {others.length > 0 && (
        <section className="recent-runs">
          <h3>Earlier runs</h3>
          <ul className="list">
            {others.map((r) => (
              <li key={r.id} className="list-item">
                <button className="list-main" onClick={() => props.setCurrentRunId(r.id)}>
                  <span className="list-icon run"><Icon name="psychology" /></span>
                  <span className="list-text">
                    <span className="list-title clip">{r.question}</span>
                    <span className="list-meta"><Badge tone="info">{r.mode === "trio" ? "Trio" : "Solo"}</Badge><span>{fmtWhen(r.updated)}</span></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
