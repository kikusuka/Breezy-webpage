import { useEffect, useRef, useState } from "react";
import type { Conv, Msg, Prefs, Provider } from "../types";
import { fmtMs, fmtUsage, fmtWhen, isLocal } from "../lib";
import { Badge, CopyBtn, Icon, Logo } from "../ui";

type Props = {
  conv: Conv | null;
  provider: Provider | null;
  busy: boolean;
  prefs: Prefs;
  onSend: (t: string) => void;
  onStop: () => void;
  onRegen: () => void;
  goModels: () => void;
};

const STATUS_TEXT: Record<Provider["status"], string> = {
  untested: "Not tested", testing: "Testing…", ok: "Reachable", error: "Last test failed",
};

function host(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

function Message({
  m, last, busy, showMeta, onRegen,
}: { m: Msg; last: boolean; busy: boolean; showMeta: boolean; onRegen: () => void }) {
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{m.content}</div>
      </div>
    );
  }
  const waiting = busy && last && !m.content && !m.error;
  return (
    <div className="msg assistant">
      <div className="avatar-sm"><Logo size={20} /></div>
      <div className="msg-body">
        {waiting && (
          <div className="waiting" aria-label="Waiting for first token">
            <span /><span /><span />
          </div>
        )}
        {m.content && <div className="text">{m.content}</div>}
        {m.error && (
          <div className="inline-error">
            <Icon name="error" />
            <div>
              <strong>Request failed.</strong>
              <span>{m.error}</span>
            </div>
          </div>
        )}
        {showMeta && !waiting && (
          <div className="meta">
            {m.via && <span>{m.via}</span>}
            {m.model && <span className="mono">{m.model}</span>}
            {!(busy && last) && <span>{fmtMs(m.ms)}</span>}
            {!(busy && last) && <span>{fmtUsage(m.usage)}</span>}
            {m.at && <span>{fmtWhen(m.at)}</span>}
          </div>
        )}
        {!(busy && last) && (m.content || m.error) && (
          <div className="msg-actions">
            {m.content && <CopyBtn text={m.content} />}
            {last && (
              <button className="ghost-btn" onClick={onRegen}>
                <Icon name="refresh" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatView({ conv, provider, busy, prefs, onSend, onStop, onRegen, goModels }: Props) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const msgs = conv?.messages ?? [];
  const lastReply = [...msgs].reverse().find((m) => m.role === "assistant" && m.content && !m.error);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  useEffect(() => { stick.current = true; }, [conv?.id]);

  const fit = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const submit = () => {
    const t = text.trim();
    if (!t || !provider || busy) return;
    onSend(t);
    setText("");
    stick.current = true;
    requestAnimationFrame(fit);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const send = prefs.enterToSend ? !e.shiftKey : e.metaKey || e.ctrlKey;
    if (send) { e.preventDefault(); submit(); }
  };

  const local = provider ? isLocal(provider.baseUrl) : false;

  return (
    <div className="chat-wrap">
      <section className="chat-main">
        <div
          className="chat-scroll"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {!conv || msgs.length === 0 ? (
            <div className="chat-empty">
              <div className="hero-logo"><Logo size={72} /></div>
              {provider ? (
                <>
                  <h1>What are we working on?</h1>
                  <p>
                    Messages go straight from this browser to <span className="mono">{host(provider.baseUrl)}</span>.
                    Breezy has no server in between.
                  </p>
                  <div className="ready-card">
                    <div className="ready-row">
                      <span className="k">Model</span>
                      <span className="v mono">{provider.model}</span>
                    </div>
                    <div className="ready-row">
                      <span className="k">Provider</span>
                      <span className="v">{provider.label} <Badge tone={local ? "info" : "off"}>{local ? "Local" : "Cloud"}</Badge></span>
                    </div>
                    <div className="ready-row">
                      <span className="k">Status</span>
                      <span className="v">{STATUS_TEXT[provider.status]}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h1>No model configured</h1>
                  <p>
                    Add a provider and pick a model. Groq and OpenRouter have free tiers, and Ollama runs
                    on your own machine.
                  </p>
                  <button className="btn primary" onClick={goModels}>
                    <Icon name="hub" /> Set up a model
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="thread">
              {msgs.map((m, i) => (
                <Message
                  key={i} m={m} last={i === msgs.length - 1} busy={busy}
                  showMeta={prefs.showMeta} onRegen={onRegen}
                />
              ))}
            </div>
          )}
        </div>

        <div className="composer-area">
          <div className="composer">
            <textarea
              ref={area}
              rows={1}
              value={text}
              disabled={!provider}
              placeholder={provider ? "Message Breezy" : "Configure a model to start chatting"}
              onChange={(e) => { setText(e.target.value); fit(); }}
              onKeyDown={onKey}
            />
            <div className="composer-row">
              <span className="composer-hint">
                {prefs.enterToSend ? "Enter to send, Shift+Enter for a new line" : "Ctrl/Cmd+Enter to send"}
              </span>
              {busy ? (
                <button className="btn stop" onClick={onStop}>
                  <Icon name="stop" /> Stop
                </button>
              ) : (
                <button className="btn primary" onClick={submit} disabled={!provider || !text.trim()}>
                  <Icon name="arrow_upward" /> Send
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside className="session">
        <h2>Session</h2>

        <div className="s-block">
          <h3>Model</h3>
          {provider ? (
            <>
              <div className="s-row"><span>Provider</span><b>{provider.label}</b></div>
              <div className="s-row"><span>Model</span><b className="mono">{provider.model}</b></div>
              <div className="s-row"><span>Runs on</span><b>{local ? "Local machine" : "Cloud"}</b></div>
              <div className="s-row"><span>Connection</span><b>{STATUS_TEXT[provider.status]}</b></div>
            </>
          ) : (
            <p className="s-empty">No model configured.</p>
          )}
        </div>

        <div className="s-block">
          <h3>Conversation</h3>
          {conv ? (
            <>
              <div className="s-row"><span>Messages</span><b>{msgs.length}</b></div>
              <div className="s-row"><span>Last activity</span><b>{fmtWhen(conv.updated)}</b></div>
              <div className="s-row"><span>Sent each turn</span><b>Full history</b></div>
            </>
          ) : (
            <p className="s-empty">No conversation open.</p>
          )}
        </div>

        <div className="s-block">
          <h3>Last response</h3>
          {lastReply ? (
            <>
              <div className="s-row"><span>Latency</span><b>{fmtMs(lastReply.ms)}</b></div>
              <div className="s-row"><span>Tokens</span><b>{fmtUsage(lastReply.usage)}</b></div>
            </>
          ) : (
            <p className="s-empty">Nothing yet.</p>
          )}
        </div>

        <div className="s-block">
          <h3>Storage</h3>
          <p className="s-note">Chats are saved in this browser's localStorage. API keys stay in memory unless you chose to remember them. Clear everything in Settings.</p>
        </div>
      </aside>
    </div>
  );
}
