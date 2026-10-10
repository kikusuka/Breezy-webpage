import { useState } from "react";

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={"material-symbols-outlined icon " + className} aria-hidden="true">
      {name}
    </span>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "err" | "off" | "info"; children: React.ReactNode }) {
  return <span className={"badge " + tone}>{children}</span>;
}

export function Logo({ size = 28 }: { size?: number }) {
  
  return (
    <img
      src="/logo.png"
      
      width={size}
      height={size}
      alt=""
      className="logo"
    />
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function Empty({
  icon, title, body, action,
}: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
    >
      <Icon name={done ? "check" : "content_copy"} />
      {done ? "Copied" : label}
    </button>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-title">{label}</div>
        <div className="toggle-hint">{hint}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={"switch" + (checked ? " on" : "")}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
