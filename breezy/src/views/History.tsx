import { useMemo, useState } from "react";
import type { Conv, Run } from "../types";
import { fmtWhen } from "../lib";
import { Badge, Empty, Icon } from "../ui";

type Item = {
  kind: "chat" | "run"; id: string; title: string; updated: number; meta: string; tag?: string;
};

type Props = {
  convs: Conv[]; runs: Run[];
  onOpenChat: (id: string) => void; onOpenRun: (id: string) => void;
  onDelConv: (id: string) => void; onDelRun: (id: string) => void;
  goChat: () => void; goResearch: () => void;
};

export default function HistoryView(p: Props) {
  const [tab, setTab] = useState<"all" | "chat" | "run">("all");
  const [q, setQ] = useState("");

  const items = useMemo<Item[]>(() => {
    const a: Item[] = p.convs.map((c) => ({
      kind: "chat", id: c.id, title: c.title || "Untitled", updated: c.updated,
      meta: `${c.messages.length} message${c.messages.length === 1 ? "" : "s"}`,
    }));
    const b: Item[] = p.runs.map((r) => ({
      kind: "run", id: r.id, title: r.question, updated: r.updated,
      meta: `${r.steps.filter((s) => s.status === "done").length} of ${r.steps.length} steps finished`,
      tag: r.mode === "trio" ? "Trio" : "Solo",
    }));
    return [...a, ...b]
      .filter((i) => (tab === "all" ? true : i.kind === tab))
      .filter((i) => i.title.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((x, y) => y.updated - x.updated);
  }, [p.convs, p.runs, tab, q]);

  const total = p.convs.length + p.runs.length;

  return (
    <div className="page">
      <header className="page-head">
        <h1>History</h1>
        <p>Chats and research runs saved in this browser.</p>
      </header>

      {total === 0 ? (
        <div className="card">
          <Empty
            icon="history"
            title="Nothing saved yet"
            body="Start a chat or run a research question and it will show up here."
            action={
              <div className="row gap">
                <button className="btn primary" onClick={p.goChat}><Icon name="chat_bubble" /> New chat</button>
                <button className="btn" onClick={p.goResearch}><Icon name="psychology" /> Open Research</button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="seg" role="tablist">
              {([["all", `All ${total}`], ["chat", `Chats ${p.convs.length}`], ["run", `Research ${p.runs.length}`]] as const).map(([k, l]) => (
                <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div className="search">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title" />
            </div>
          </div>

          {items.length === 0 ? (
            <div className="card">
              <Empty icon="search_off" title="No matches" body="Nothing in this view matches that filter. Clear it to see everything." />
            </div>
          ) : (
            <ul className="list">
              {items.map((i) => (
                <li key={i.kind + i.id} className="list-item">
                  <button className="list-main" onClick={() => (i.kind === "chat" ? p.onOpenChat(i.id) : p.onOpenRun(i.id))}>
                    <span className={"list-icon " + i.kind}><Icon name={i.kind === "chat" ? "chat_bubble" : "psychology"} /></span>
                    <span className="list-text">
                      <span className="list-title clip">{i.title}</span>
                      <span className="list-meta">
                        {i.tag && <Badge tone="info">{i.tag}</Badge>}
                        <span>{i.meta}</span>
                        <span>{fmtWhen(i.updated)}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={"Delete " + i.title}
                    onClick={() => {
                      if (window.confirm("Delete this item? This can't be undone.")) {
                        i.kind === "chat" ? p.onDelConv(i.id) : p.onDelRun(i.id);
                      }
                    }}
                  >
                    <Icon name="delete" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
