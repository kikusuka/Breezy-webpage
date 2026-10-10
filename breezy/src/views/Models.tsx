import { useState } from "react";
import type { Provider } from "../types";
import { PRESETS, fmtWhen, isLocal, usable } from "../lib";
import { Badge, Field, Icon, Spinner } from "../ui";
import { checkBaseUrl } from "../validate";

type Props = {
  providers: Provider[];
  activeId: string;
  setActive: (id: string) => void;
  onAdd: (presetId: string) => void;
  onUpdate: (id: string, patch: Partial<Provider>) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
};

function PresetGrid({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="preset-grid">
      {PRESETS.map((pr) => (
        <button key={pr.id} className="preset" onClick={() => onPick(pr.id)}>
          <span className="preset-name">{pr.label}</span>
          <span className="preset-url mono clip">{pr.baseUrl || "You enter the URL"}</span>
        </button>
      ))}
    </div>
  );
}

function Card({ p, isActive, props }: { p: Provider; isActive: boolean; props: Props }) {
  const [showKey, setShowKey] = useState(false);
  const local = p.baseUrl ? isLocal(p.baseUrl) : null;
  const testing = p.status === "testing";
  const urlCheck = p.baseUrl.trim() ? checkBaseUrl(p.baseUrl) : null;
  const urlBad = !!urlCheck && !urlCheck.ok;
  const models = p.model && !p.models.includes(p.model) ? [p.model, ...p.models] : p.models;

  return (
    <article className={"card provider" + (isActive ? " is-active" : "")}>
      <div className="provider-head">
        <input
          className="title-input"
          value={p.label}
          aria-label="Provider name"
          onChange={(e) => props.onUpdate(p.id, { label: e.target.value })}
        />
        <div className="row gap-sm">
          {local !== null && <Badge tone={local ? "info" : "off"}>{local ? "Local" : "Cloud"}</Badge>}
          {p.status === "ok" && <Badge tone="ok">Reachable</Badge>}
          {p.status === "error" && <Badge tone="err">Test failed</Badge>}
          {p.status === "untested" && <Badge tone="off">Not tested</Badge>}
          {testing && <Badge tone="off">Testing</Badge>}
        </div>
      </div>

      <div className="stack">
        <Field label="Base URL">
          <input
            className="input mono"
            value={p.baseUrl}
            placeholder="https://host/v1"
            spellCheck={false}
            onChange={(e) => props.onUpdate(p.id, { baseUrl: e.target.value, status: "untested", error: undefined })}
          />
        </Field>
        {urlCheck && !urlCheck.ok && <div className="warn-line"><Icon name="error" />{urlCheck.error}</div>}
        {urlCheck && urlCheck.ok && urlCheck.warn && <div className="warn-line amber"><Icon name="warning" />{urlCheck.warn}</div>}

        <Field
          label="API key"
          hint={local ? "Local servers usually need no key." : "Sent only to this provider's base URL."}
        >
          <div className="input-wrap">
            <input
              className="input mono"
              type={showKey ? "text" : "password"}
              value={p.apiKey}
              placeholder={local ? "Optional" : "Paste your key"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => props.onUpdate(p.id, { apiKey: e.target.value, status: "untested", error: undefined })}
            />
            <button className="icon-btn" aria-label={showKey ? "Hide key" : "Show key"} onClick={() => setShowKey((s) => !s)}>
              <Icon name={showKey ? "visibility_off" : "visibility"} />
            </button>
          </div>
        </Field>

        <label className="check">
          <input
            type="checkbox"
            checked={!!p.rememberKey}
            onChange={(e) => props.onUpdate(p.id, { rememberKey: e.target.checked })}
          />
          <span>
            <span className="field-label">Remember this key on this device</span>
            <span className="field-hint" style={{ display: "block" }}>
              {p.rememberKey
                ? "Stored unencrypted in this browser's localStorage. Any script running on this page can read it. Untick to remove it from storage."
                : "Off: the key stays in memory only and you'll re-enter it after a reload."}
            </span>
          </span>
        </label>

        <Field
          label="Model"
          hint={p.models.length ? `${p.models.length} models listed by the provider.` : "Test the connection to list models, or type a model ID."}
        >
          {p.models.length ? (
            <select className="input mono" value={p.model} onChange={(e) => props.onUpdate(p.id, { model: e.target.value })}>
              <option value="">Select a model</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              className="input mono"
              value={p.model}
              placeholder="e.g. llama-3.3-70b-versatile"
              spellCheck={false}
              onChange={(e) => props.onUpdate(p.id, { model: e.target.value })}
            />
          )}
        </Field>
      </div>

      {p.status === "error" && p.error && (
        <div className="inline-error">
          <Icon name="error" />
          <div><strong>Connection test failed.</strong><span>{p.error}</span></div>
        </div>
      )}
      {p.status === "ok" && (
        <p className="ok-line"><Icon name="check_circle" /> Models endpoint answered {fmtWhen(p.testedAt)}. This does not prove chat works.</p>
      )}

      <div className="provider-foot">
        <button className="btn" onClick={() => props.onTest(p.id)} disabled={!p.baseUrl || urlBad || testing}>
          {testing ? <Spinner /> : <Icon name="network_check" />} Test connection
        </button>
        {isActive ? (
          <span className="active-tag"><Icon name="check" /> In use</span>
        ) : (
          <button
            className="btn primary"
            disabled={!usable(p) || urlBad}
            title={usable(p) && !urlBad ? "" : "Needs a valid base URL and a model"}
            onClick={() => props.setActive(p.id)}
          >
            Use this model
          </button>
        )}
        <div className="grow" />
        <button
          className="icon-btn danger"
          aria-label={"Remove " + p.label}
          onClick={() => window.confirm(`Remove ${p.label} and its saved key?`) && props.onDelete(p.id)}
        >
          <Icon name="delete" />
        </button>
      </div>
    </article>
  );
}

export default function ModelsView(props: Props) {
  const { providers, activeId } = props;
  const [adding, setAdding] = useState(false);
  const active = providers.find((p) => p.id === activeId);
  const reachable = providers.filter((p) => p.status === "ok").length;
  const nLocal = providers.filter((p) => p.baseUrl && isLocal(p.baseUrl)).length;
  const nCloud = providers.filter((p) => p.baseUrl && !isLocal(p.baseUrl)).length;

  return (
    <div className="page wide">
      <header className="page-head split">
        <div>
          <h1>Models</h1>
          <p>Connect any OpenAI-compatible endpoint. Keys are sent only to the endpoint you enter.</p>
        </div>
        {providers.length > 0 && (
          <button className="btn primary" onClick={() => setAdding((a) => !a)}>
            <Icon name={adding ? "close" : "add"} /> {adding ? "Close" : "Add provider"}
          </button>
        )}
      </header>

      {providers.length > 0 && (
        <div className="stats">
          <div className="stat">
            <span className="stat-k">Providers</span>
            <span className="stat-v">{providers.length}</span>
            <span className="stat-s">{nCloud} cloud, {nLocal} local</span>
          </div>
          <div className="stat">
            <span className="stat-k">Reachable</span>
            <span className="stat-v">{reachable}<small> of {providers.length}</small></span>
            <span className="stat-s">{reachable === 0 ? "Run a connection test" : "Models endpoint answered"}</span>
          </div>
          <div className="stat">
            <span className="stat-k">In use</span>
            <span className="stat-v sm">{active?.label ?? "None"}</span>
            <span className="stat-s mono clip">{active?.model || "No model selected"}</span>
          </div>
          <div className="stat">
            <span className="stat-k">Runs on</span>
            <span className="stat-v sm">{usable(active) ? (isLocal(active.baseUrl) ? "Local" : "Cloud") : "Unknown"}</span>
            <span className="stat-s">{usable(active) ? "Based on the base URL" : "Nothing active"}</span>
          </div>
        </div>
      )}

      {(adding || providers.length === 0) && (
        <section className="card add-card">
          <h2>{providers.length === 0 ? "Add your first provider" : "Choose a provider"}</h2>
          <p className="muted">{providers.length === 0 ? "No model configured yet. " : ""}Pick a preset to fill in the URL. You still add your own key.</p>
          <PresetGrid onPick={(id) => { props.onAdd(id); setAdding(false); }} />
        </section>
      )}

      <div className="provider-grid">
        {providers.map((p) => (
          <Card key={p.id} p={p} isActive={p.id === activeId} props={props} />
        ))}
      </div>
    </div>
  );
}
