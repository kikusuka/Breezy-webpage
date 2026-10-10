import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Conv, Msg, NavItem, Prefs, Provider, RoleKey, Roles, Run, View,
} from "./types";
import {
  DEFAULT_PREFS, LAB_NAV, LS, MAIN_NAV, PRESETS, ROLE_LABEL, TABS, TITLES,
  friendlyError, isLocal, streamChat, testProvider, uid, usable, useStore,
} from "./lib";
import { Icon, Logo } from "./ui";
import { clearIssues, getIssues, subscribeIssues } from "./storage";
import { outputsBefore, resetFrom } from "./runs";
import ChatView from "./views/Chat";
import ResearchView from "./views/Research";
import HistoryView from "./views/History";
import ModelsView from "./views/Models";
import { DocsView, LabView, SettingsView } from "./views/Misc";

/* Runs/chats left mid-stream by a reload can't still be running. */
const fixRuns = (rs: Run[]): Run[] =>
  rs.map((r) => ({
    ...r,
    steps: r.steps.map((s) =>
      s.status === "running" || s.status === "pending" ? { ...s, status: "stopped" as const } : s
    ),
  }));
/* Reachability is only evidence at the moment of a test, so a reload resets it.
   Keys saved by versions before the "remember" option existed stay remembered. */
const fixProviders = (ps: Provider[]): Provider[] =>
  ps.map((p) => ({
    ...p,
    status: "untested" as const,
    error: undefined,
    rememberKey: p.rememberKey ?? (p.apiKey ? true : false),
  }));
const stripKeys = (ps: Provider[]) => ps.map((p) => (p.rememberKey ? p : { ...p, apiKey: "" }));

function rolePrompt(role: RoleKey, q: string, out: string[]): { role: string; content: string }[] {
  const honesty =
    " You have no web access in this session. Do not invent sources, citations, URLs, or statistics. If you are unsure, say so.";
  if (role === "solo")
    return [
      { role: "system", content: "You are a careful research assistant. Answer clearly and structure the answer." + honesty },
      { role: "user", content: q },
    ];
  if (role === "analyst")
    return [
      { role: "system", content: "You are the Analyst. Break the question into parts, give structured findings, and list your assumptions and uncertainty." + honesty },
      { role: "user", content: q },
    ];
  if (role === "critic")
    return [
      { role: "system", content: "You are the Critic. Review the Analyst's findings. Point out errors, unsupported claims, missing cases, and weak reasoning. Be specific." + honesty },
      { role: "user", content: `Question:\n${q}\n\nAnalyst findings:\n${out[0] ?? ""}` },
    ];
  return [
    { role: "system", content: "You are the Synthesizer. Combine the Analyst's findings and the Critic's objections into one final answer. Keep what holds up, fix what the Critic caught, and end with open questions." + honesty },
    { role: "user", content: `Question:\n${q}\n\nAnalyst findings:\n${out[0] ?? ""}\n\nCritic review:\n${out[1] ?? ""}` },
  ];
}

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [drawer, setDrawer] = useState(false);

  const [providers, setProviders] = useStore<Provider[]>(LS.providers, [], { fix: fixProviders, toStored: stripKeys });
  const [activeId, setActiveId] = useStore<string>(LS.active, "");
  const [convs, setConvs] = useStore<Conv[]>(LS.convs, []);
  const [runs, setRuns] = useStore<Run[]>(LS.runs, [], { fix: fixRuns });
  const [roles, setRoles] = useStore<Roles>(LS.roles, {});
  const [prefs, setPrefs] = useStore<Prefs>(LS.prefs, DEFAULT_PREFS);
  const [issues, setIssues] = useState(getIssues());
  useEffect(() => {
    setIssues(getIssues());
    return subscribeIssues(() => setIssues(getIssues()));
  }, []);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);

  const active = providers.find((p) => p.id === activeId) ?? null;
  const provider = usable(active) ? active : null;
  const conv = convs.find((c) => c.id === currentId) ?? null;
  const recent = useMemo(() => [...convs].sort((a, b) => b.updated - a.updated).slice(0, 6), [convs]);

  const go = (v: View) => { setView(v); setDrawer(false); };
  const newChat = () => { setCurrentId(null); go("chat"); };
  const openChat = (id: string) => { setCurrentId(id); go("chat"); };
  const openRun = (id: string) => { setCurrentRunId(id); go("research"); };

  /* ── providers ── */
  const addProvider = (presetId: string) => {
    const pr = PRESETS.find((x) => x.id === presetId) ?? PRESETS[PRESETS.length - 1];
    const p: Provider = {
      id: uid(), label: pr.label.replace(" (local)", ""), baseUrl: pr.baseUrl,
      apiKey: "", model: "", models: [], status: "untested", rememberKey: false,
    };
    setProviders((ps) => [...ps, p]);
    if (!activeId) setActiveId(p.id);
  };
  const updProvider = (id: string, patch: Partial<Provider>) =>
    setProviders((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const delProvider = (id: string) => {
    setProviders((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId("");
  };
  const runTest = async (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    updProvider(id, { status: "testing", error: undefined });
    const r = await testProvider(p);
    updProvider(id, r.ok
      ? { status: "ok", models: r.models, error: undefined, testedAt: Date.now() }
      : { status: "error", error: r.error, testedAt: Date.now() });
  };

  /* ── chat ── */
  const patchConv = (id: string, fn: (c: Conv) => Conv) =>
    setConvs((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  async function runAssistant(id: string, history: Msg[], p: Provider) {
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    const placeholder: Msg = { role: "assistant", content: "", via: p.label, model: p.model, at: Date.now() };
    patchConv(id, (c) => ({ ...c, messages: [...history, placeholder], updated: Date.now() }));
    const setLast = (fn: (m: Msg) => Msg) =>
      patchConv(id, (c) => {
        const m = [...c.messages];
        m[m.length - 1] = fn(m[m.length - 1]);
        return { ...c, messages: m };
      });
    try {
      const r = await streamChat(
        p,
        history.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content })),
        (d) => setLast((m) => ({ ...m, content: m.content + d })),
        ac.signal
      );
      setLast((m) => ({ ...m, ms: r.ms, usage: r.usage }));
    } catch (e: any) {
      if (e?.name !== "AbortError") setLast((m) => ({ ...m, error: friendlyError(e) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function send(text: string) {
    if (!provider || busy) return;
    const userMsg: Msg = { role: "user", content: text, at: Date.now() };
    if (!currentId || !conv) {
      const id = uid();
      setConvs((cs) => [{ id, title: text.slice(0, 48), updated: Date.now(), messages: [userMsg] }, ...cs]);
      setCurrentId(id);
      runAssistant(id, [userMsg], provider);
    } else {
      const base = [...conv.messages];
      // drop a trailing failed/empty assistant turn so history stays clean
      while (base.length && base[base.length - 1].role === "assistant" && (base[base.length - 1].error || !base[base.length - 1].content)) base.pop();
      runAssistant(conv.id, [...base, userMsg], provider);
    }
  }

  function regenerate() {
    if (!provider || !conv || busy) return;
    const msgs = [...conv.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (msgs.length) runAssistant(conv.id, msgs, provider);
  }
  const stop = () => abortRef.current?.abort();

  /* ── research ── */
  const resolveRole = (k: RoleKey): { prov: Provider; model: string } | null => {
    const a = roles[k];
    const prov = providers.find((p) => p.id === a?.providerId) ?? provider;
    if (!prov || !prov.baseUrl) return null;
    const model = a?.model || prov.model;
    return model ? { prov, model } : null;
  };

  async function executeRun(run: Run, from: number) {
    const ac = new AbortController();
    runAbort.current = ac;
    setRunBusy(true);
    const patch = (i: number, fn: (s: Run["steps"][number]) => Run["steps"][number]) =>
      setRuns((rs) => rs.map((x) => x.id === run.id
        ? { ...x, updated: Date.now(), steps: x.steps.map((s, j) => (j === i ? fn(s) : s)) } : x));
    const stopRest = (fromIdx: number) =>
      setRuns((rs) => rs.map((x) => x.id === run.id
        ? { ...x, steps: x.steps.map((s, j) => (j >= fromIdx && s.status === "pending" ? { ...s, status: "stopped" as const } : s)) } : x));
    const outputs = outputsBefore(run, from);
    try {
      for (let i = from; i < run.steps.length; i++) {
        const st = run.steps[i];
        const prov = providers.find((p) => p.id === st.providerId);
        if (!prov || !st.key) {
          patch(i, (s) => ({ ...s, status: "error", error: "This step's provider is no longer configured." }));
          stopRest(i + 1);
          break;
        }
        patch(i, (s) => ({ ...s, status: "running", ran: true }));
        let acc = "";
        try {
          const out = await streamChat(
            { ...prov, model: st.model },
            rolePrompt(st.key, run.question, outputs),
            (d) => { acc += d; patch(i, (s) => ({ ...s, content: s.content + d })); },
            ac.signal
          );
          outputs.push(acc);
          patch(i, (s) => ({ ...s, status: "done", ms: out.ms, usage: out.usage }));
        } catch (e: any) {
          if (e?.name === "AbortError") patch(i, (s) => ({ ...s, status: "stopped" }));
          else patch(i, (s) => ({ ...s, status: "error", error: friendlyError(e) }));
          stopRest(i + 1);
          break;
        }
      }
    } finally {
      setRunBusy(false);
      runAbort.current = null;
    }
  }

  async function startRun(question: string, mode: "solo" | "trio") {
    if (runBusy) return;
    const keys: RoleKey[] = mode === "solo" ? ["solo"] : ["analyst", "critic", "synth"];
    const res = keys.map(resolveRole);
    if (res.some((r) => !r)) return;
    const r = res as { prov: Provider; model: string }[];
    const run: Run = {
      id: uid(), question, mode, updated: Date.now(),
      steps: keys.map((k, i) => ({
        key: k, providerId: r[i].prov.id, ran: false,
        role: ROLE_LABEL[k], via: r[i].prov.label, model: r[i].model,
        local: isLocal(r[i].prov.baseUrl), content: "", status: "pending" as const,
      })),
    };
    setRuns((rs) => [run, ...rs]);
    setCurrentRunId(run.id);
    await executeRun(run, 0);
  }

  /** Re-runs a failed or stopped step and the steps after it. Finished earlier steps are not repeated. */
  async function retryStep(runId: string, index: number) {
    const run = runs.find((x) => x.id === runId);
    if (!run || runBusy) return;
    const reset = resetFrom(run, index);
    setRuns((rs) => rs.map((x) => (x.id === runId ? reset : x)));
    await executeRun(reset, index);
  }
  const stopRun = () => runAbort.current?.abort();

  /* ── history / data ── */
  const delConv = (id: string) => {
    setConvs((cs) => cs.filter((c) => c.id !== id));
    if (currentId === id) setCurrentId(null);
  };
  const delRun = (id: string) => {
    setRuns((rs) => rs.filter((r) => r.id !== id));
    if (currentRunId === id) setCurrentRunId(null);
  };
  const clearAll = () => {
    if (!window.confirm("Delete all providers, keys, chats and research runs stored in this browser?")) return;
    Object.values(LS).forEach((k) => { localStorage.removeItem(k); localStorage.removeItem(k + ".corrupt"); });
    setProviders([]); setActiveId(""); setConvs([]); setRuns([]); setRoles({});
    setPrefs(DEFAULT_PREFS); setCurrentId(null); setCurrentRunId(null);
  };

  const navBtn = (item: NavItem) => (
    <button key={item.id} className={"nav-item" + (view === item.id ? " active" : "")} onClick={() => go(item.id)}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </button>
  );

  const pillLabel = !active ? "No model configured" : !active.model ? "No model selected" : active.model;
  const pillState = provider ? (provider.status === "ok" ? "ok" : provider.status === "error" ? "err" : "idle") : "off";

  return (
    <div className="app">
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <aside className={"sidebar" + (drawer ? " open" : "")}>
        <div className="brand">
          <Logo size={30} />
          <span className="brand-name">Breezy</span>
        </div>

        <button className="new-chat" onClick={newChat}>
          <Icon name="add" /> New chat
        </button>

        <nav className="nav">{MAIN_NAV.map(navBtn)}</nav>

        <div className="nav-label">Recent chats</div>
        <nav className="nav">
          {recent.length === 0 && <div className="nav-empty">No conversations yet.</div>}
          {recent.map((c) => (
            <button
              key={c.id}
              className={"nav-item small" + (view === "chat" && currentId === c.id ? " active" : "")}
              onClick={() => openChat(c.id)}
            >
              <span className="clip">{c.title || "Untitled"}</span>
            </button>
          ))}
        </nav>

        <div className="nav-label">Laboratories</div>
        <nav className="nav">{LAB_NAV.map(navBtn)}</nav>

        <div className="spacer" />

        <div className="account">
          <div className="avatar"><Icon name="person" /></div>
          <div className="account-text">
            <span className="account-title">Local workspace</span>
            <span className="account-sub">Not signed in. Data stays in this browser.</span>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>
          <span className="topbar-title">{TITLES[view]}</span>
          <div className="spacer" />
          <button className="pill" onClick={() => go("models")} title="Open Models">
            <span className={"dot " + pillState} />
            <span className="pill-text clip mono">{pillLabel}</span>
            {provider && (
              <span className="pill-tag">{isLocal(provider.baseUrl) ? "Local" : "Cloud"}</span>
            )}
          </button>
        </header>

        {issues.length > 0 && (
          <div className="banner" role="alert">
            <Icon name="warning" />
            <div className="banner-text">{issues[issues.length - 1].message}</div>
            <button className="icon-btn" aria-label="Dismiss" onClick={clearIssues}><Icon name="close" /></button>
          </div>
        )}

        <main className={"main" + (view === "chat" ? " is-chat" : "")}>
          {view === "chat" && (
            <ChatView
              conv={conv} provider={provider} busy={busy} prefs={prefs}
              onSend={send} onStop={stop} onRegen={regenerate} goModels={() => go("models")}
            />
          )}
          {view === "research" && (
            <ResearchView
              providers={providers} provider={provider} roles={roles} setRoles={setRoles}
              runs={runs} currentRunId={currentRunId} setCurrentRunId={setCurrentRunId}
              runBusy={runBusy} resolveRole={resolveRole}
              onStart={startRun} onStop={stopRun} onRetry={retryStep} goModels={() => go("models")}
            />
          )}
          {view === "history" && (
            <HistoryView
              convs={convs} runs={runs}
              onOpenChat={openChat} onOpenRun={openRun} onDelConv={delConv} onDelRun={delRun}
              goChat={newChat} goResearch={() => go("research")}
            />
          )}
          {view === "models" && (
            <ModelsView
              providers={providers} activeId={activeId} setActive={setActiveId}
              onAdd={addProvider} onUpdate={updProvider} onDelete={delProvider} onTest={runTest}
            />
          )}
          {view === "docs" && <DocsView />}
          {view === "settings" && (
            <SettingsView
              providers={providers} convs={convs} runs={runs}
              prefs={prefs} setPrefs={setPrefs} onClear={clearAll}
            />
          )}
          {(view === "build" || view === "canvas") && <LabView kind={view} />}
        </main>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => (
          <button key={t.id} className={"tab" + (view === t.id ? " active" : "")} onClick={() => go(t.id)}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
