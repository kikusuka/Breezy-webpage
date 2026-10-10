import type { Conv, Prefs, Provider, Run } from "../types";
import { PRESETS, fmtBytes, storageBytes } from "../lib";
import { Empty, Icon, Toggle } from "../ui";

export function DocsView() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Docs</h1>
        <p>What Breezy does today, and what to check when something doesn't connect.</p>
      </header>

      <section className="card prose">
        <h2>Quick start</h2>
        <ol>
          <li>Open <b>Models</b> and add a provider preset.</li>
          <li>Paste your key, press <b>Test connection</b>, then choose a model.</li>
          <li>Press <b>Use this model</b>. Chat and Research now use it.</li>
        </ol>
      </section>

      <section className="card prose">
        <h2>Provider presets</h2>
        <p className="muted">Base URLs Breezy fills in for you. Whether a browser can call them depends on each provider's CORS policy, which this build has not verified.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Preset</th><th>Base URL</th></tr></thead>
            <tbody>
              {PRESETS.filter((p) => p.baseUrl).map((p) => (
                <tr key={p.id}><td>{p.label}</td><td className="mono">{p.baseUrl}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card prose">
        <h2>Using Ollama</h2>
        <p>Ollama refuses requests from other origins by default. Allow this site, then restart it:</p>
        <pre className="mono">OLLAMA_ORIGINS="*" ollama serve</pre>
        <p className="muted">A deployed https site calling http://localhost can be blocked by the browser as mixed content. If that happens, run Breezy locally with <span className="mono">npm run dev</span>.</p>
      </section>

      <section className="card prose">
        <h2>Where your data lives</h2>
        <p>Chats and research runs are stored in this browser's localStorage. API keys are kept in memory only unless you tick "Remember this key" on a provider. A remembered key is stored unencrypted, so any script running on this page, such as a compromised dependency or a browser extension with page access, can read it. There is no Breezy server. Server-side encrypted storage comes with the backend step.</p>
      </section>

      <section className="card prose">
        <h2>Known limits</h2>
        <ul>
          <li>Replies are shown as plain text. Markdown and code blocks come next.</li>
          <li>Research has no web search, so it cannot cite sources.</li>
          <li>Trio runs its three steps in order. You can retry a failed step, but you can't intervene mid-run yet.</li>
          <li>Only OpenAI-compatible endpoints are supported. Gemini, Anthropic and Puter native APIs are not built.</li>
          <li>Large histories are saved with one throttled localStorage write per second. There is no IndexedDB layer yet.</li>
        </ul>
      </section>
    </div>
  );
}

export function LabView({ kind }: { kind: "build" | "canvas" }) {
  const build = kind === "build";
  return (
    <div className="page">
      <header className="page-head">
        <h1>{build ? "Build" : "Canvas"}</h1>
        <p>{build ? "A coding workspace tied to your own repositories." : "A freeform space for drafts and diagrams."}</p>
      </header>
      <div className="card">
        <Empty
          icon={build ? "terminal" : "draw"}
          title="Not available yet"
          body={build
            ? "Build will need an explicit GitHub connection from you before it can read or change anything. Nothing is connected."
            : "Canvas hasn't been built yet. Nothing here is saved or running."}
        />
      </div>
    </div>
  );
}

type SProps = {
  providers: Provider[]; convs: Conv[]; runs: Run[];
  prefs: Prefs; setPrefs: (fn: (p: Prefs) => Prefs) => void;
  onClear: () => void;
};

export function SettingsView({ providers, convs, runs, prefs, setPrefs, onClear }: SProps) {
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), chats: convs, research: runs }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "breezy-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p>Only options that change something are listed here.</p>
      </header>

      <section className="card">
        <h2>Chat</h2>
        <Toggle
          label="Show message details"
          hint="Provider, model, time, latency and tokens under each reply."
          checked={prefs.showMeta}
          onChange={(v) => setPrefs((p) => ({ ...p, showMeta: v }))}
        />
        <Toggle
          label="Enter sends the message"
          hint="Off means Ctrl or Cmd+Enter sends, and Enter adds a new line."
          checked={prefs.enterToSend}
          onChange={(v) => setPrefs((p) => ({ ...p, enterToSend: v }))}
        />
      </section>

      <section className="card">
        <h2>Data in this browser</h2>
        <div className="kv">
          <div><span>Providers</span><b>{providers.length}</b></div>
          <div><span>Chats</span><b>{convs.length}</b></div>
          <div><span>Research runs</span><b>{runs.length}</b></div>
          <div><span>Space used</span><b>{fmtBytes(storageBytes())}</b></div>
        </div>
        <div className="row gap">
          <button className="btn" onClick={exportData} disabled={!convs.length && !runs.length}>
            <Icon name="download" /> Export chats and research
          </button>
        </div>
        <p className="muted small">The export leaves out providers and keys.</p>
      </section>

      <section className="card danger-zone">
        <h2>Clear local data</h2>
        <p className="muted">Deletes providers, keys, chats, research runs and settings from this browser. It can't be undone.</p>
        <button className="btn danger" onClick={onClear}><Icon name="delete_forever" /> Clear everything</button>
      </section>
    </div>
  );
}
