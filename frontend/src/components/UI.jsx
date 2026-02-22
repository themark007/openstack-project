// src/components/UI.jsx — reusable UI primitives
import { useEffect, useRef } from "react";

export function GlitchText({ children, className = "" }) {
  return <span className={`glitch ${className}`} data-text={children}>{children}</span>;
}

export function Spinner({ sm }) {
  return <span className={`spinner ${sm ? "sm" : ""}`} />;
}

export function Toast({ id, msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const color = { ok: "#00ff88", error: "#ff4466", warn: "#ffaa00", info: "#00aaff" }[type] || "#00ff88";
  const icon  = { ok: "✓", error: "✕", warn: "⚠", info: "ℹ" }[type] || "✓";
  return (
    <div className="toast" style={{ borderColor: color, color }} onClick={onClose}>
      <span>{icon}</span> {msg}
    </div>
  );
}

export function Modal({ title, onClose, children, wide, full }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-box ${wide ? "wide" : ""} ${full ? "full" : ""}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <GlitchText>{title}</GlitchText>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, half }) {
  return (
    <div className={`field-wrap ${half ? "half" : ""}`}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function Input({ ...props }) {
  return <input className="ui-input" {...props} />;
}

export function Select({ options = [], placeholder, ...props }) {
  return (
    <select className="ui-input" {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Textarea({ ...props }) {
  return <textarea className="ui-input" rows={3} {...props} />;
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-label">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Btn({ children, onClick, variant = "ghost", disabled, loading, danger, full, sm }) {
  const cls = ["btn", `btn-${variant}`, danger && "danger", full && "full", sm && "sm"].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={onClick} disabled={disabled || loading}>
      {loading ? <Spinner sm /> : children}
    </button>
  );
}

export function IconBtn({ icon, onClick, color, title, sm }) {
  return (
    <button className={`icon-btn ${sm ? "sm" : ""}`} onClick={onClick} title={title} style={{ color, borderColor: color + "55" }}>
      {icon}
    </button>
  );
}

export function Badge({ label, color = "#00ffcc" }) {
  return (
    <span className="badge" style={{ color, borderColor: color, background: color + "15" }}>
      {label}
    </span>
  );
}

export function StatusDot({ status }) {
  const colors = { ACTIVE: "#00ff88", SHUTOFF: "#ff4466", BUILD: "#ffaa00", ERROR: "#ff0055", PAUSED: "#8888ff", SUSPENDED: "#ff6600", DOWN: "#ff4466", UP: "#00ff88", active: "#00ff88", inactive: "#ff4466" };
  const c = colors[status] || "#888";
  return <span className="status-dot" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />;
}

export function Table({ cols, rows, empty = "No data", loading }) {
  return (
    <div className="data-table">
      <div className="table-head" style={{ gridTemplateColumns: cols.map(c => c.w || "1fr").join(" ") }}>
        {cols.map(c => <span key={c.key}>{c.label}</span>)}
      </div>
      {loading && <div className="table-loading"><Spinner /></div>}
      {!loading && rows.length === 0 && <div className="table-empty">{empty}</div>}
      {!loading && rows.map((row, i) => (
        <div key={row.id || i} className="table-row" style={{ gridTemplateColumns: cols.map(c => c.w || "1fr").join(" ") }}>
          {cols.map(c => (
            <div key={c.key} className="table-cell">
              {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map(t => (
        <button key={t.id} className={`tab-btn ${active === t.id ? "active" : ""}`} onClick={() => onChange(t.id)}>
          {t.icon && <span>{t.icon}</span>}
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ConfirmModal({ title, message, onConfirm, onClose, danger }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ padding: "8px 0 20px", color: "var(--text-dim)", fontSize: 13 }}>{message}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" danger={danger} onClick={() => { onConfirm(); onClose(); }}>CONFIRM</Btn>
      </div>
    </Modal>
  );
}

export function StatCard({ label, value, sub, color = "#00ffcc", icon, onClick }) {
  return (
    <div className="stat-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div className="stat-val" style={{ color }}>{value ?? "—"}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      <div className="stat-glow" style={{ background: color }} />
    </div>
  );
}

export function EmptyState({ icon = "◎", message }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div>{message}</div>
    </div>
  );
}

export function SectionHeader({ title, actions }) {
  return (
    <div className="section-header">
      <div className="section-title">{title}</div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}

export function CopyText({ text }) {
  const copy = () => { navigator.clipboard.writeText(text).catch(() => {}); };
  return (
    <span className="copy-text" onClick={copy} title="Click to copy">
      {text} <span className="copy-icon">⎘</span>
    </span>
  );
}

export function Mono({ children }) {
  return <span className="mono">{children}</span>;
}
