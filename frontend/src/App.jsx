import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:3001/api";

// ─── helpers ────────────────────────────────────────────────────────────────
const api = async (path, opts = {}, token) => {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { "X-Auth-Token": token } : {}), ...opts.headers },
    ...opts,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const statusColor = (s = "") => {
  const m = { ACTIVE: "#00ff88", SHUTOFF: "#ff4466", BUILD: "#ffaa00", ERROR: "#ff0055", PAUSED: "#8888ff", SUSPENDED: "#ff6600" };
  return m[s.toUpperCase()] || "#888";
};

// ─── Particle Canvas ────────────────────────────────────────────────────────
function ParticleField() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const pts = Array.from({ length: 120 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
      r: Math.random() * 1.5 + .5, a: Math.random()
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,200,${p.a * .5})`;
        ctx.fill();
      });
      pts.forEach((p, i) => pts.slice(i + 1).forEach(q => {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 120) {
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(0,220,180,${(1 - d / 120) * .15})`;
          ctx.lineWidth = .5; ctx.stroke();
        }
      }));
      raf = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, opacity: .6 }} />;
}

// ─── Glitch Text ────────────────────────────────────────────────────────────
function GlitchText({ children, className = "" }) {
  return (
    <span className={`glitch ${className}`} data-text={children}>
      {children}
    </span>
  );
}

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading, error }) {
  const [form, setForm] = useState({ username: "admin", password: "", project: "admin" });
  return (
    <div className="login-overlay">
      <div className="login-box">
        <div className="login-logo">
          <div className="logo-ring" />
          <div className="logo-ring ring2" />
          <div className="logo-ring ring3" />
          <span className="logo-mc">MC</span>
        </div>
        <h1 className="login-title"><GlitchText>MARK CLOUD</GlitchText></h1>
        <p className="login-sub">OpenStack Control Plane · 192.168.61.150</p>
        <div className="login-form">
          {["username", "password", "project"].map(f => (
            <div className="field-wrap" key={f}>
              <label>{f.toUpperCase()}</label>
              <input
                type={f === "password" ? "password" : "text"}
                value={form[f]}
                onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && onLogin(form)}
                placeholder={f === "project" ? "admin" : ""}
              />
            </div>
          ))}
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primary" onClick={() => onLogin(form)} disabled={loading}>
            {loading ? <span className="spinner" /> : "INITIALIZE CONNECTION"}
          </button>
        </div>
        <div className="login-footer">
          <span className="dot active" /> KEYSTONE AUTH · <span className="dot active" /> NOVA COMPUTE · <span className="dot active" /> NEUTRON NET
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "#00ffcc", icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div className="stat-val" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      <div className="stat-glow" style={{ background: color }} />
    </div>
  );
}

// ─── Instance Row ────────────────────────────────────────────────────────────
function InstanceRow({ server, token, onRefresh }) {
  const [acting, setActing] = useState(false);
  const action = async (body) => {
    setActing(true);
    try {
      await api(`/compute/servers/${server.id}/action`, { method: "POST", body: JSON.stringify(body) }, token);
      setTimeout(onRefresh, 2000);
    } catch (e) { console.error(e); }
    setActing(false);
  };
  const del = async () => {
    if (!confirm(`Delete ${server.name}?`)) return;
    setActing(true);
    try {
      await api(`/compute/servers/${server.id}`, { method: "DELETE" }, token);
      setTimeout(onRefresh, 2000);
    } catch (e) { console.error(e); }
    setActing(false);
  };
  const st = server.status || "";
  const ip = Object.values(server.addresses || {}).flat().map(a => a["addr"]).join(", ") || "—";
  return (
    <div className="instance-row">
      <div className="inst-status-dot" style={{ background: statusColor(st), boxShadow: `0 0 8px ${statusColor(st)}` }} />
      <div className="inst-info">
        <div className="inst-name">{server.name}</div>
        <div className="inst-id">{server.id.slice(0, 20)}…</div>
      </div>
      <div className="inst-ip">{ip}</div>
      <div className="inst-status" style={{ color: statusColor(st) }}>{st}</div>
      <div className="inst-flavor">{server.flavor?.original_name || server.flavor?.id || "—"}</div>
      <div className="inst-actions">
        {acting ? <span className="spinner sm" /> : <>
          {st === "ACTIVE" && <button className="act-btn warn" onClick={() => action({ "os-stop": null })}>⏹</button>}
          {st === "SHUTOFF" && <button className="act-btn ok" onClick={() => action({ "os-start": null })}>▶</button>}
          {st === "ACTIVE" && <button className="act-btn info" onClick={() => action({ reboot: { type: "SOFT" } })}>↺</button>}
          <button className="act-btn danger" onClick={del}>✕</button>
        </>}
      </div>
    </div>
  );
}

// ─── Network Card ────────────────────────────────────────────────────────────
function NetworkCard({ net }) {
  return (
    <div className="net-card">
      <div className="net-name">{net.name}</div>
      <div className="net-id">{(net.id || "").slice(0, 18)}…</div>
      <div className="net-badge" style={{ background: net.shared ? "#00ffcc22" : "#ff446622", border: `1px solid ${net.shared ? "#00ffcc" : "#ff4466"}`, color: net.shared ? "#00ffcc" : "#ff4466" }}>
        {net.shared ? "SHARED" : "PRIVATE"}
      </div>
      <div className="net-status" style={{ color: net.status === "ACTIVE" ? "#00ff88" : "#ff4466" }}>● {net.status}</div>
    </div>
  );
}

// ─── Launch Modal ─────────────────────────────────────────────────────────────
function LaunchModal({ token, onClose, onDone }) {
  const [form, setForm] = useState({ name: "", image_id: "", flavor_id: "", network_id: "", key_name: "" });
  const [images, setImages] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api("/images", {}, token).then(setImages).catch(() => {}),
      api("/compute/flavors", {}, token).then(setFlavors).catch(() => {}),
      api("/network/networks", {}, token).then(setNetworks).catch(() => {}),
      api("/compute/keypairs", {}, token).then(d => setKeys(d.map(k => k.keypair || k))).catch(() => {}),
    ]);
  }, [token]);

  const launch = async () => {
    setLoading(true);
    try {
      const body = {
        server: {
          name: form.name,
          imageRef: form.image_id,
          flavorRef: form.flavor_id,
          networks: form.network_id ? [{ uuid: form.network_id }] : [],
          ...(form.key_name ? { key_name: form.key_name } : {})
        }
      };
      await api("/compute/servers", { method: "POST", body: JSON.stringify(body) }, token);
      onDone();
    } catch (e) { alert("Launch failed: " + e.message); }
    setLoading(false);
  };

  const sel = (f, arr, labelFn, valFn) => (
    <select value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}>
      <option value="">— select —</option>
      {arr.map(i => <option key={valFn(i)} value={valFn(i)}>{labelFn(i)}</option>)}
    </select>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><GlitchText>LAUNCH INSTANCE</GlitchText><button onClick={onClose}>✕</button></div>
        <div className="modal-form">
          <label>NAME</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="my-instance" />
          <label>IMAGE</label>
          {sel("image_id", images, i => `${i.name} (${i.disk_format || ""})`, i => i.id)}
          <label>FLAVOR</label>
          {sel("flavor_id", flavors, f => `${f.name} · ${f.vcpus}vCPU ${f.ram}MB`, f => f.id)}
          <label>NETWORK</label>
          {sel("network_id", networks, n => n.name, n => n.id)}
          <label>KEY PAIR (optional)</label>
          {sel("key_name", keys, k => k.name, k => k.name)}
          <button className="btn-primary" onClick={launch} disabled={loading || !form.name || !form.image_id || !form.flavor_id}>
            {loading ? <span className="spinner" /> : "🚀 LAUNCH"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [servers, setServers] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [images, setImages] = useState([]);
  const [routers, setRouters] = useState([]);
  const [fips, setFips] = useState([]);
  const [secgroups, setSecgroups] = useState([]);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const login = async (form) => {
    setAuthLoading(true); setAuthError("");
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Login failed");
      setAuth(d);
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const fetchAll = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    const t = auth.token;
    await Promise.all([
      api("/compute/servers", {}, t).then(setServers).catch(() => {}),
      api("/network/networks", {}, t).then(setNetworks).catch(() => {}),
      api("/images", {}, t).then(setImages).catch(() => {}),
      api("/network/routers", {}, t).then(setRouters).catch(() => {}),
      api("/network/floatingips", {}, t).then(setFips).catch(() => {}),
      api("/network/security-groups", {}, t).then(setSecgroups).catch(() => {}),
      api("/compute/quota", {}, t).then(setQuota).catch(() => {}),
    ]);
    setLastRefresh(new Date());
    setLoading(false);
  }, [auth]);

  useEffect(() => { if (auth) fetchAll(); }, [auth, fetchAll]);
  useEffect(() => {
    const id = setInterval(() => { if (auth) fetchAll(); }, 30000);
    return () => clearInterval(id);
  }, [auth, fetchAll]);

  if (!auth) return (
    <>
      <ParticleField />
      <LoginScreen onLogin={login} loading={authLoading} error={authError} />
    </>
  );

  const activeCount = servers.filter(s => s.status === "ACTIVE").length;
  const tabs = [
    { id: "dashboard", label: "DASHBOARD", icon: "⬡" },
    { id: "compute", label: "COMPUTE", icon: "⚡" },
    { id: "network", label: "NETWORK", icon: "◈" },
    { id: "images", label: "IMAGES", icon: "◉" },
    { id: "security", label: "SECURITY", icon: "⬟" },
  ];

  return (
    <div className="app">
      <ParticleField />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-ring sm" />
          <span>MARK<br/><strong>CLOUD</strong></span>
        </div>
        <nav className="sidebar-nav">
          {tabs.map(t => (
            <button key={t.id} className={`nav-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <span className="nav-icon">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === "compute" && <span className="nav-badge">{servers.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="conn-status">
            <span className="dot active" />
            <div>
              <div className="conn-host">192.168.61.150</div>
              <div className="conn-sub">OpenStack · VMware</div>
            </div>
          </div>
          <div className="user-badge">
            <span className="user-icon">◎</span>
            <span>{auth.user?.name || "admin"}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <GlitchText>{tabs.find(t => t.id === tab)?.label}</GlitchText>
            {lastRefresh && <span className="refresh-time">Last sync: {lastRefresh.toLocaleTimeString()}</span>}
          </div>
          <div className="topbar-actions">
            {loading && <span className="spinner sm" />}
            <button className="btn-ghost" onClick={fetchAll}>↻ REFRESH</button>
            {tab === "compute" && <button className="btn-primary" onClick={() => setShowLaunch(true)}>+ LAUNCH</button>}
            <button className="btn-ghost danger" onClick={() => setAuth(null)}>⏻ LOGOUT</button>
          </div>
        </header>

        <div className="content">

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && (
            <div className="dashboard">
              <div className="stats-grid">
                <StatCard label="INSTANCES" value={servers.length} sub={`${activeCount} active`} color="#00ffcc" icon="⚡" />
                <StatCard label="NETWORKS" value={networks.length} color="#00aaff" icon="◈" />
                <StatCard label="IMAGES" value={images.length} color="#aa44ff" icon="◉" />
                <StatCard label="ROUTERS" value={routers.length} color="#ff8800" icon="⬡" />
                <StatCard label="FLOATING IPs" value={fips.length} sub={`${fips.filter(f => f.fixed_ip_address).length} used`} color="#ff4466" icon="⬟" />
                {quota && <StatCard label="vCPU QUOTA" value={`${quota.cores?.in_use || 0}/${quota.cores?.limit || "∞"}`} color="#ffcc00" icon="◎" />}
              </div>

              <div className="dash-grid">
                <div className="dash-panel">
                  <div className="panel-title">RECENT INSTANCES</div>
                  <div className="instance-list mini">
                    {servers.slice(0, 6).map(s => (
                      <div key={s.id} className="mini-instance">
                        <span className="mini-dot" style={{ background: statusColor(s.status) }} />
                        <span className="mini-name">{s.name}</span>
                        <span className="mini-status" style={{ color: statusColor(s.status) }}>{s.status}</span>
                      </div>
                    ))}
                    {servers.length === 0 && <div className="empty-state">No instances found</div>}
                  </div>
                </div>

                <div className="dash-panel">
                  <div className="panel-title">SYSTEM TOPOLOGY</div>
                  <div className="topology">
                    <div className="topo-node controller">
                      <div className="topo-pulse" />
                      <span>CONTROLLER</span>
                      <small>192.168.61.150</small>
                    </div>
                    <div className="topo-lines">
                      {["KEYSTONE", "NOVA", "NEUTRON", "GLANCE"].map(s => (
                        <div key={s} className="topo-service">
                          <div className="topo-line" />
                          <span>{s}</span>
                          <span className="topo-ok">●</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="dash-panel">
                  <div className="panel-title">INSTANCE STATUS BREAKDOWN</div>
                  <div className="status-chart">
                    {Object.entries(
                      servers.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), {})
                    ).map(([st, cnt]) => (
                      <div key={st} className="status-bar-row">
                        <span style={{ color: statusColor(st) }}>{st}</span>
                        <div className="status-bar-track">
                          <div className="status-bar-fill" style={{ width: `${(cnt / servers.length) * 100}%`, background: statusColor(st) }} />
                        </div>
                        <span>{cnt}</span>
                      </div>
                    ))}
                    {servers.length === 0 && <div className="empty-state">No data</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── COMPUTE ── */}
          {tab === "compute" && (
            <div className="compute-panel">
              <div className="instance-table">
                <div className="table-header">
                  <span>STATUS</span><span>NAME / ID</span><span>IP ADDRESS</span><span>STATE</span><span>FLAVOR</span><span>ACTIONS</span>
                </div>
                {servers.length === 0 && <div className="empty-state">No instances found. Launch one!</div>}
                {servers.map(s => <InstanceRow key={s.id} server={s} token={auth.token} onRefresh={fetchAll} />)}
              </div>
            </div>
          )}

          {/* ── NETWORK ── */}
          {tab === "network" && (
            <div className="network-panel">
              <div className="panel-title">NETWORKS</div>
              <div className="net-grid">
                {networks.map(n => <NetworkCard key={n.id} net={n} />)}
                {networks.length === 0 && <div className="empty-state">No networks found</div>}
              </div>
              <div className="panel-title mt">ROUTERS</div>
              <div className="net-grid">
                {routers.map(r => (
                  <div key={r.id} className="net-card">
                    <div className="net-name">{r.name}</div>
                    <div className="net-id">{(r.id || "").slice(0, 18)}…</div>
                    <div className="net-status" style={{ color: r.status === "ACTIVE" ? "#00ff88" : "#ff4466" }}>● {r.status}</div>
                    <div className="net-badge" style={{ background: "#ffaa0022", border: "1px solid #ffaa00", color: "#ffaa00" }}>
                      {r.external_gateway_info ? "GATEWAY" : "INTERNAL"}
                    </div>
                  </div>
                ))}
                {routers.length === 0 && <div className="empty-state">No routers found</div>}
              </div>
              <div className="panel-title mt">FLOATING IPs</div>
              <div className="fip-table">
                {fips.length === 0 && <div className="empty-state">No floating IPs found</div>}
                {fips.map(f => (
                  <div key={f.id} className="fip-row">
                    <span className="fip-ip">{f.floating_ip_address}</span>
                    <span className="fip-fixed">{f.fixed_ip_address || "unassigned"}</span>
                    <span className="fip-status" style={{ color: f.status === "ACTIVE" ? "#00ff88" : "#888" }}>● {f.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── IMAGES ── */}
          {tab === "images" && (
            <div className="images-panel">
              <div className="images-grid">
                {images.length === 0 && <div className="empty-state">No images found</div>}
                {images.map(img => (
                  <div key={img.id} className="image-card">
                    <div className="img-icon">◉</div>
                    <div className="img-name">{img.name || "Unnamed"}</div>
                    <div className="img-id">{(img.id || "").slice(0, 16)}…</div>
                    <div className="img-meta">
                      <span className="img-tag">{img.disk_format?.toUpperCase() || "—"}</span>
                      <span className="img-tag">{img.container_format?.toUpperCase() || "—"}</span>
                    </div>
                    <div className="img-size">{img.size ? `${(img.size / 1e6).toFixed(0)} MB` : "—"}</div>
                    <div className="img-status" style={{ color: img.status === "active" ? "#00ff88" : "#888" }}>● {img.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECURITY ── */}
          {tab === "security" && (
            <div className="security-panel">
              <div className="panel-title">SECURITY GROUPS</div>
              {secgroups.length === 0 && <div className="empty-state">No security groups found</div>}
              {secgroups.map(sg => (
                <div key={sg.id} className="secgroup-card">
                  <div className="sg-header">
                    <span className="sg-name">{sg.name}</span>
                    <span className="sg-id">{(sg.id || "").slice(0, 20)}…</span>
                    <span className="sg-desc">{sg.description}</span>
                  </div>
                  <div className="rules-list">
                    {(sg.security_group_rules || []).slice(0, 6).map(r => (
                      <div key={r.id} className="rule-row">
                        <span className="rule-dir" style={{ color: r.direction === "ingress" ? "#00ffcc" : "#ff8800" }}>{r.direction}</span>
                        <span className="rule-proto">{r.protocol || "any"}</span>
                        <span className="rule-port">{r.port_range_min != null ? `${r.port_range_min}-${r.port_range_max}` : "all"}</span>
                        <span className="rule-cidr">{r.remote_ip_prefix || r.remote_group_id?.slice(0, 12) || "any"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showLaunch && <LaunchModal token={auth.token} onClose={() => setShowLaunch(false)} onDone={() => { setShowLaunch(false); fetchAll(); }} />}
    </div>
  );
}
