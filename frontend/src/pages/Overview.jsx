// src/pages/Overview.jsx  — Customizable widget dashboard
// Replaces the existing Overview.jsx with drag-to-reorder, toggle, pin widgets
import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../hooks/useStore.js';
import { GET } from '../api/client.js';

// ── Persist layout to localStorage ───────────────────────────────────────────
const STORAGE_KEY = 'sns-overview-layout';
const DEFAULT_LAYOUT = [
  { id:'cluster_health', visible:true, label:'Cluster Health',    icon:'⬡' },
  { id:'instances',      visible:true, label:'Instances',         icon:'⚡' },
  { id:'resources',      visible:true, label:'Resource Usage',    icon:'▦' },
  { id:'network',        visible:true, label:'Network Summary',   icon:'◎' },
  { id:'storage',        visible:true, label:'Storage',           icon:'◉' },
  { id:'recent_events',  visible:true, label:'Recent Events',     icon:'☰' },
  { id:'floating_ips',   visible:true, label:'Floating IPs',      icon:'◆' },
  { id:'images',         visible:false,label:'Images',            icon:'◈' },
  { id:'quotas',         visible:false,label:'Quota Usage',       icon:'▥' },
  { id:'hypervisors',    visible:true, label:'Hypervisors',       icon:'⬡' },
];

function loadLayout() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return DEFAULT_LAYOUT;
    const saved = JSON.parse(s);
    // Merge saved order/visibility with any new widgets in default
    const merged = saved.filter(s => DEFAULT_LAYOUT.find(d => d.id === s.id))
      .map(s => ({ ...DEFAULT_LAYOUT.find(d => d.id === s.id), visible: s.visible }));
    DEFAULT_LAYOUT.forEach(d => { if (!merged.find(m => m.id === d.id)) merged.push(d); });
    return merged;
  } catch { return DEFAULT_LAYOUT; }
}

// ── Individual Widget Components ──────────────────────────────────────────────
const SC = { ACTIVE:'#00ff88', SHUTOFF:'#ff4466', BUILD:'#ffaa00', ERROR:'#ff0055', PAUSED:'#8888ff', SUSPENDED:'#ff6600' };
const sc = s => SC[s] || '#888';

function StatNum({ value, label, color = 'var(--accent)', sub }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 700, color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ label, used, total, color }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const c = pct > 80 ? '#ff4466' : pct > 60 ? '#ffaa00' : color;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
        <span style={{ fontSize: 10, color: c, fontFamily: 'var(--font-mono)' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 2, transition: 'width .8s ease' }} />
      </div>
    </div>
  );
}

// ── Widget Definitions (what actually renders inside each) ─────────────────────
function W_ClusterHealth({ state }) {
  const svcs = state.services || [];
  const up   = svcs.filter(s => s.state === 'up').length;
  const down = svcs.filter(s => s.state !== 'up').length;
  const overall = down === 0 ? 'HEALTHY' : down < 3 ? 'DEGRADED' : 'CRITICAL';
  const oc = overall === 'HEALTHY' ? '#00ff88' : overall === 'DEGRADED' ? '#ffaa00' : '#ff4466';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: oc, fontFamily: 'var(--font-display)' }}>{overall}</div>
        <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginTop: 4 }}>CLUSTER STATUS</div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <StatNum value={up}   label="UP"   color="#00ff88" />
        <StatNum value={down} label="DOWN" color={down > 0 ? '#ff4466' : '#888'} />
      </div>
    </div>
  );
}

function W_Instances({ state, onNavigate }) {
  const byStatus = state.servers.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), {});
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
        <StatNum value={state.servers.length} label="TOTAL" color="var(--accent)" />
        <StatNum value={byStatus.ACTIVE || 0} label="ACTIVE" color="#00ff88" />
        <StatNum value={byStatus.SHUTOFF || 0} label="STOPPED" color="#ff4466" />
        <StatNum value={(byStatus.BUILD || 0) + (byStatus.RESIZE || 0)} label="WORKING" color="#ffaa00" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(byStatus).map(([st, cnt]) => (
          <div key={st} style={{ padding: '3px 8px', background: `${sc(st)}14`, border: `1px solid ${sc(st)}44`, borderRadius: 'var(--radius)', fontSize: 10, color: sc(st), fontWeight: 700 }}>
            {cnt} {st}
          </div>
        ))}
      </div>
      {onNavigate && <button onClick={() => onNavigate('compute')} style={{ marginTop: 10, padding: '5px 12px', fontSize: 10, background: 'rgba(0,255,200,.06)', border: '1px solid var(--border-hi)', color: 'var(--accent)', cursor: 'pointer', letterSpacing: 1, width: '100%' }}>VIEW ALL →</button>}
    </div>
  );
}

function W_Resources({ state }) {
  const h = state.hypervisors;
  if (h.length === 0) return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No hypervisor data</div>;
  const t = h.reduce((a, x) => ({ vcpus: a.vcpus + (x.vcpus||0), vcpus_used: a.vcpus_used + (x.vcpus_used||0), ram: a.ram + (x.memory_mb||0), ram_used: a.ram_used + (x.memory_mb_used||0), disk: a.disk + (x.local_gb||0), disk_used: a.disk_used + (x.local_gb_used||0) }), { vcpus:0, vcpus_used:0, ram:0, ram_used:0, disk:0, disk_used:0 });
  return (
    <div>
      <MiniBar label={`vCPU — ${t.vcpus_used}/${t.vcpus}`}   used={t.vcpus_used} total={t.vcpus}   color="#00ffcc" />
      <MiniBar label={`RAM — ${Math.round(t.ram_used/1024)}/${Math.round(t.ram/1024)} GB`}  used={t.ram_used}  total={t.ram}    color="#00aaff" />
      <MiniBar label={`Disk — ${t.disk_used}/${t.disk} GB`}   used={t.disk_used} total={t.disk}   color="#00ff88" />
    </div>
  );
}

function W_Network({ state, onNavigate }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
      <StatNum value={state.networks.length}    label="NETWORKS"    color="#00ffcc" />
      <StatNum value={state.routers.length}     label="ROUTERS"     color="#ffaa00" />
      <StatNum value={state.secgroups.length}   label="SEC GROUPS"  color="#00aaff" />
      <StatNum value={state.floatingips.filter(f => f.fixed_ip_address).length} label="FIPs USED" color="#aa44ff" sub={`/ ${state.floatingips.length} total`} />
    </div>
  );
}

function W_Storage({ state }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 10 }}>
      <StatNum value={state.volumes.length}  label="VOLUMES" color="#00aaff" sub={state.volumes.reduce((a,v)=>a+(v.size||0),0)+'GB total'} />
      <StatNum value={state.images.length}   label="IMAGES"  color="#aa44ff" />
      <StatNum value={state.keypairs.length} label="KEYPAIRS" color="#00ffcc" />
      <StatNum value={state.volumes.filter(v=>v.status==='available').length} label="AVAILABLE" color="#00ff88" />
    </div>
  );
}

function W_FloatingIPs({ state, onNavigate }) {
  const used = state.floatingips.filter(f => f.fixed_ip_address);
  const free = state.floatingips.filter(f => !f.fixed_ip_address);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 10 }}>
        <StatNum value={used.length} label="ASSOCIATED" color="#aa44ff" />
        <StatNum value={free.length} label="AVAILABLE"  color="#00ff88" />
      </div>
      <div style={{ maxHeight: 120, overflowY: 'auto' }}>
        {used.slice(0, 6).map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#aa44ff' }}>{f.floating_ip_address}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: 10 }}>→ {f.fixed_ip_address}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function W_RecentEvents() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    // Pull from multiple sources to build a timeline
    const evts = [];
    // We can't easily pull all server events without iterating — show a placeholder
    setEvents([{ time: new Date().toLocaleTimeString(), type: 'system', msg: 'Dashboard loaded' }]);
  }, []);
  return (
    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
      {events.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>{e.time}</span>
          <span style={{ color: 'var(--text-dim)' }}>{e.msg}</span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>Full event history available on each instance's detail page.</div>
    </div>
  );
}

function W_Images({ state }) {
  const byFormat = state.images.reduce((a,i)=>({...a,[i.disk_format]:(a[i.disk_format]||0)+1}),{});
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <StatNum value={state.images.length} label="TOTAL" color="var(--accent)" />
      {Object.entries(byFormat).map(([fmt,cnt])=>(<StatNum key={fmt} value={cnt} label={fmt?.toUpperCase()} color="#00aaff"/>))}
      <StatNum value={state.images.filter(i=>i.status==='active').length} label="ACTIVE" color="#00ff88" />
    </div>
  );
}

function W_Quotas({ state }) {
  const q = state.quotas || {};
  const items = [
    { label:'Instances',    used:state.servers.length,          limit:q.instances },
    { label:'vCPUs',        used:state.hypervisors?.reduce((a,h)=>a+(h.vcpus_used||0),0)||0, limit:q.cores },
    { label:'RAM (MB)',     used:state.hypervisors?.reduce((a,h)=>a+(h.memory_mb_used||0),0)||0, limit:q.ram },
    { label:'Volumes',      used:state.volumes.length,          limit:q.volumes },
    { label:'Floating IPs', used:state.floatingips.length,      limit:q.floatingip },
    { label:'Sec Groups',   used:state.secgroups.length,        limit:q.security_group },
  ].filter(i=>i.limit);
  if (items.length === 0) return <div style={{ color:'var(--text-dim)',fontSize:12 }}>Load quotas from Admin → Quotas</div>;
  return <div>{items.map(i=><MiniBar key={i.label} label={`${i.label} ${i.used}/${i.limit}`} used={i.used} total={i.limit} color="#00ffcc"/>)}</div>;
}

function W_Hypervisors({ state, onNavigate }) {
  return (
    <div>
      {state.hypervisors.slice(0, 4).map(h => (
        <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: h.state === 'up' ? '#00ff88' : '#ff4466' }} />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{h.hypervisor_hostname?.split('.')[0]}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-dim)' }}>
            <span>⚡ {h.vcpus_used}/{h.vcpus}</span>
            <span>◈ {Math.round(h.memory_mb_used/1024)}/{Math.round(h.memory_mb/1024)}GB</span>
            <span>▶ {h.running_vms} VMs</span>
          </div>
        </div>
      ))}
      {state.hypervisors.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No hypervisor data</div>}
    </div>
  );
}

const WIDGET_COMPONENTS = {
  cluster_health: W_ClusterHealth,
  instances:      W_Instances,
  resources:      W_Resources,
  network:        W_Network,
  storage:        W_Storage,
  recent_events:  W_RecentEvents,
  floating_ips:   W_FloatingIPs,
  images:         W_Images,
  quotas:         W_Quotas,
  hypervisors:    W_Hypervisors,
};

// ── Draggable Widget Shell ─────────────────────────────────────────────────────
function Widget({ item, onDragStart, onDragOver, onDrop, onToggle, onNavigate, children }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={e => { e.preventDefault(); onDragOver(item.id); }}
      onDrop={() => onDrop(item.id)}
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'grab', transition: 'box-shadow .15s', userSelect: 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(0,255,200,.02)' }}>
        <span style={{ fontSize: 12, color: 'var(--accent)', marginRight: 8 }}>{item.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-dim)', flex: 1 }}>{item.label.toUpperCase()}</span>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', cursor: 'grab' }}>⠿</span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  );
}

// ── Customizer Panel ──────────────────────────────────────────────────────────
function LayoutCustomizer({ layout, onSave, onClose }) {
  const [local, setLocal] = useState(layout);
  const toggle = (id) => setLocal(l => l.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title"><span>CUSTOMIZE OVERVIEW</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14 }}>Toggle widgets and drag to reorder on the main page.</div>
          {local.map(w => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--accent)' }}>{w.icon}</span>
                <span style={{ fontSize: 12, color: w.visible ? 'var(--text)' : 'var(--text-dim)' }}>{w.label}</span>
              </div>
              <button onClick={() => toggle(w.id)}
                style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, background: w.visible ? 'rgba(0,255,200,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${w.visible ? 'var(--accent)' : 'var(--border)'}`, color: w.visible ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', letterSpacing: 1 }}>
                {w.visible ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px' }}>
          <button className="ui-btn" onClick={onClose}>CANCEL</button>
          <button className="ui-btn primary" onClick={() => { onSave(local); onClose(); }}>SAVE LAYOUT</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Overview Page ────────────────────────────────────────────────────────
export default function Overview({ onNavigate }) {
  const { state } = useStore();
  const [layout, setLayout]     = useState(loadLayout);
  const [showCustomize, setShowCustomize] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const saveLayout = (l) => {
    setLayout(l);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(l.map(w => ({ id: w.id, visible: w.visible }))));
  };

  const onDragStart = (id) => setDragging(id);
  const onDragOver  = (id) => setDragOver(id);
  const onDrop      = (targetId) => {
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return; }
    setLayout(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(w => w.id === dragging);
      const toIdx   = next.findIndex(w => w.id === targetId);
      const [item]  = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(w => ({ id: w.id, visible: w.visible }))));
      return next;
    });
    setDragging(null); setDragOver(null);
  };

  const visible = layout.filter(w => w.visible);

  return (
    <div className="page">
      {showCustomize && (
        <LayoutCustomizer layout={layout} onSave={saveLayout} onClose={() => setShowCustomize(false)} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: 'var(--text)' }}>OVERVIEW</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>Drag widgets to reorder · Toggle visibility in Customize</div>
        </div>
        <button onClick={() => setShowCustomize(true)} className="ui-btn" style={{ fontSize: 11 }}>
          ⚙ CUSTOMIZE
        </button>
      </div>

      {/* Widget grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
        {visible.map(item => {
          const Comp = WIDGET_COMPONENTS[item.id];
          if (!Comp) return null;
          return (
            <Widget key={item.id} item={item}
              onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}>
              <Comp state={state} onNavigate={onNavigate} />
            </Widget>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
          <div style={{ marginBottom: 12 }}>All widgets hidden.</div>
          <button onClick={() => setShowCustomize(true)} className="ui-btn primary">⚙ CUSTOMIZE</button>
        </div>
      )}
    </div>
  );
}