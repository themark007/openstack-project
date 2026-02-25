// src/pages/SecurityGroupBuilder.jsx
// Visual security group rule builder with protocol presets
import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore.js';
import { GET, POST, DEL } from '../api/client.js';

// ── Protocol Presets ──────────────────────────────────────────────────────────
const PRESETS = [
  { id:'ssh',       icon:'⎗', label:'SSH',         protocol:'tcp',  port_min:22,    port_max:22,    desc:'Secure Shell' },
  { id:'http',      icon:'⬡', label:'HTTP',         protocol:'tcp',  port_min:80,    port_max:80,    desc:'Web traffic' },
  { id:'https',     icon:'⬡', label:'HTTPS',        protocol:'tcp',  port_min:443,   port_max:443,   desc:'Secure web' },
  { id:'rdp',       icon:'⬢', label:'RDP',          protocol:'tcp',  port_min:3389,  port_max:3389,  desc:'Remote Desktop' },
  { id:'mysql',     icon:'◉', label:'MySQL',        protocol:'tcp',  port_min:3306,  port_max:3306,  desc:'MySQL/MariaDB' },
  { id:'postgres',  icon:'◉', label:'PostgreSQL',   protocol:'tcp',  port_min:5432,  port_max:5432,  desc:'PostgreSQL' },
  { id:'redis',     icon:'◉', label:'Redis',        protocol:'tcp',  port_min:6379,  port_max:6379,  desc:'Redis cache' },
  { id:'mongo',     icon:'◉', label:'MongoDB',      protocol:'tcp',  port_min:27017, port_max:27017, desc:'MongoDB' },
  { id:'dns',       icon:'◎', label:'DNS',          protocol:'udp',  port_min:53,    port_max:53,    desc:'DNS queries' },
  { id:'smtp',      icon:'◈', label:'SMTP',         protocol:'tcp',  port_min:25,    port_max:25,    desc:'Email outbound' },
  { id:'imaps',     icon:'◈', label:'IMAPS',        protocol:'tcp',  port_min:993,   port_max:993,   desc:'Secure email' },
  { id:'k8s',       icon:'⎈', label:'Kubernetes',   protocol:'tcp',  port_min:6443,  port_max:6443,  desc:'K8s API server' },
  { id:'etcd',      icon:'⎈', label:'etcd',         protocol:'tcp',  port_min:2379,  port_max:2380,  desc:'etcd cluster' },
  { id:'icmp',      icon:'◑', label:'ICMP (Ping)',  protocol:'icmp', port_min:null,  port_max:null,  desc:'Allow ping' },
  { id:'all_tcp',   icon:'⬟', label:'All TCP',      protocol:'tcp',  port_min:1,     port_max:65535, desc:'All TCP ports (⚠ wide)' },
  { id:'all_udp',   icon:'⬟', label:'All UDP',      protocol:'udp',  port_min:1,     port_max:65535, desc:'All UDP ports' },
  { id:'all',       icon:'⚡', label:'ALL Traffic',  protocol:'-1',   port_min:null,  port_max:null,  desc:'⚠ No restrictions' },
];

const RISK = { all:'#ff4466', all_tcp:'#ffaa00', all_udp:'#ffaa00' };
const PCOLORS = { tcp:'#00ffcc', udp:'#00aaff', icmp:'#ffaa00', '-1':'#ff4466' };

function RuleRow({ rule, onDelete }) {
  const pc = PCOLORS[rule.protocol] || '#888';
  const port = rule.port_range_min === rule.port_range_max
    ? (rule.port_range_min ?? 'any')
    : `${rule.port_range_min ?? '*'}–${rule.port_range_max ?? '*'}`;
  const cidr = rule.remote_ip_prefix || rule.remote_group_id?.slice(0, 12) || 'any';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 80px 100px 1fr 44px', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: rule.direction === 'ingress' ? '#00ff88' : '#ffaa00', letterSpacing: 1 }}>{rule.direction?.toUpperCase()}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: pc, fontFamily: 'var(--font-mono)' }}>{(rule.protocol || 'ANY').toUpperCase()}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{rule.protocol === 'icmp' ? 'n/a' : port}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{cidr}</span>
      <button onClick={() => onDelete(rule.id)} style={{ background: 'none', border: '1px solid rgba(255,68,102,.3)', color: 'var(--danger)', cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}>✕</button>
    </div>
  );
}

function AddRuleModal({ sgId, sgName, onClose, onDone, toast }) {
  const [mode, setMode]       = useState('preset');  // preset | custom
  const [direction, setDir]   = useState('ingress');
  const [protocol, setProt]   = useState('tcp');
  const [portMin, setPortMin] = useState('');
  const [portMax, setPortMax] = useState('');
  const [cidr, setCidr]       = useState('0.0.0.0/0');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const applyPreset = (p) => {
    setSelected(p.id);
    setProt(p.protocol);
    setPortMin(p.port_min != null ? String(p.port_min) : '');
    setPortMax(p.port_max != null ? String(p.port_max) : '');
  };

  const add = async () => {
    setLoading(true);
    try {
      const body = {
        security_group_id: sgId,
        direction,
        ethertype: 'IPv4',
        ...(protocol !== '-1' && { protocol }),
        ...(portMin && { port_range_min: parseInt(portMin) }),
        ...(portMax && { port_range_max: parseInt(portMax) }),
        ...(cidr    && { remote_ip_prefix: cidr }),
      };
      await POST('/network/security-group-rules', body);
      toast('Rule added!', 'ok');
      onDone();
    } catch(e) { toast(e.message, 'error'); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span>ADD RULE — {sgName}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '0 20px', borderBottom: '1px solid var(--border)', display: 'flex' }}>
          {['preset', 'custom'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${mode === m ? 'var(--accent)' : 'transparent'}`, color: mode === m ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* Direction always visible */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['ingress', 'egress'].map(d => (
              <button key={d} onClick={() => setDir(d)}
                style={{ padding: '7px 18px', background: direction === d ? (d === 'ingress' ? 'rgba(0,255,136,.1)' : 'rgba(255,170,0,.1)') : 'transparent', border: `1px solid ${direction === d ? (d === 'ingress' ? '#00ff88' : '#ffaa00') : 'var(--border)'}`, color: direction === d ? (d === 'ingress' ? '#00ff88' : '#ffaa00') : 'var(--text-dim)', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                {d === 'ingress' ? '↓ INGRESS' : '↑ EGRESS'}
              </button>
            ))}
          </div>

          {mode === 'preset' && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 10 }}>PROTOCOL PRESETS — click to select</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
                {PRESETS.map(p => {
                  const sel = selected === p.id;
                  const risk = RISK[p.id];
                  return (
                    <div key={p.id} onClick={() => applyPreset(p)}
                      style={{ padding: '10px 12px', border: `1px solid ${sel ? 'var(--accent)' : risk ? risk + '44' : 'var(--border)'}`, background: sel ? 'rgba(0,255,200,.06)' : 'var(--surface)', cursor: 'pointer', borderRadius: 'var(--radius)', transition: 'all .15s' }}>
                      <div style={{ fontSize: 16, marginBottom: 4 }}>{p.icon}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: sel ? 'var(--accent)' : risk || 'var(--text)' }}>{p.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                        {p.protocol === '-1' ? 'ALL' : p.protocol?.toUpperCase()} {p.port_min != null ? `:${p.port_min}${p.port_min !== p.port_max ? '–' + p.port_max : ''}` : ''}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{p.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom / Override fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 5 }}>PROTOCOL</div>
              <select className="ui-input" style={{ width: '100%', padding: '8px 10px' }} value={protocol} onChange={e => setProt(e.target.value)}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP</option>
                <option value="-1">ANY</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 5 }}>PORT MIN</div>
              <input className="ui-input" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box' }}
                value={portMin} onChange={e => setPortMin(e.target.value)} placeholder={protocol === 'icmp' ? 'n/a' : '22'} disabled={protocol === 'icmp' || protocol === '-1'} />
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 5 }}>PORT MAX</div>
              <input className="ui-input" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box' }}
                value={portMax} onChange={e => setPortMax(e.target.value)} placeholder={protocol === 'icmp' ? 'n/a' : '22'} disabled={protocol === 'icmp' || protocol === '-1'} />
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 5 }}>CIDR</div>
              <input className="ui-input" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box' }}
                value={cidr} onChange={e => setCidr(e.target.value)} placeholder="0.0.0.0/0" />
            </div>
          </div>

          {cidr === '0.0.0.0/0' && (
            <div style={{ marginTop: 10, padding: '7px 12px', background: 'rgba(255,170,0,.06)', border: '1px solid rgba(255,170,0,.2)', fontSize: 11, color: 'var(--warn)', borderRadius: 'var(--radius)' }}>
              ⚠ CIDR 0.0.0.0/0 allows access from ANY IP address. Restrict to your IP for sensitive ports.
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px' }}>
          <button className="ui-btn" onClick={onClose}>CANCEL</button>
          <button className="ui-btn primary" onClick={add} disabled={loading}>{loading ? '…' : '+ ADD RULE'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Security Group Builder Page ──────────────────────────────────────────
export default function SecurityGroupBuilder() {
  const { state, toast } = useStore();
  const [selected, setSelected] = useState(null);
  const [rules, setRules]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [filterDir, setFilterDir] = useState('all');

  const loadRules = async (sgId) => {
    if (!sgId) return;
    setLoading(true);
    try {
      const r = await GET(`/network/security-group-rules?security_group_id=${sgId}`);
      setRules(Array.isArray(r) ? r : []);
    } catch(e) { toast(e.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { if (selected) loadRules(selected); }, [selected]);

  const deleteRule = async (ruleId) => {
    try {
      await DEL(`/network/security-group-rules/${ruleId}`);
      toast('Rule deleted', 'ok');
      loadRules(selected);
    } catch(e) { toast(e.message, 'error'); }
  };

  const sg = state.secgroups.find(s => s.id === selected);
  const filtered = filterDir === 'all' ? rules : rules.filter(r => r.direction === filterDir);
  const ingress = rules.filter(r => r.direction === 'ingress').length;
  const egress  = rules.filter(r => r.direction === 'egress').length;

  return (
    <div className="page" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, height: '100%' }}>
      {showAdd && sg && (
        <AddRuleModal sgId={selected} sgName={sg.name} onClose={() => setShowAdd(false)}
          onDone={() => { setShowAdd(false); loadRules(selected); }} toast={toast} />
      )}

      {/* Left: SG list */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)' }}>
          SECURITY GROUPS ({state.secgroups.length})
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {state.secgroups.map(sg => (
            <button key={sg.id} onClick={() => setSelected(sg.id)}
              style={{ width: '100%', padding: '11px 14px', background: selected === sg.id ? 'rgba(0,255,200,.06)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', borderLeft: `2px solid ${selected === sg.id ? 'var(--accent)' : 'transparent'}`, color: selected === sg.id ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: selected === sg.id ? 700 : 400 }}>
              <div>⬢ {sg.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{sg.id?.slice(0, 20)}…</div>
              {sg.description && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{sg.description}</div>}
            </button>
          ))}
          {state.secgroups.length === 0 && <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>No security groups</div>}
        </div>
      </div>

      {/* Right: Rule builder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!selected && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 40 }}>⬢</span>
            <span>Select a security group to manage its rules</span>
          </div>
        )}

        {selected && sg && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>⬢ {sg.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{sg.id}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--ok)' }}>↓ {ingress} ingress</span>
                <span style={{ fontSize: 11, color: 'var(--warn)' }}>↑ {egress} egress</span>
                {['all', 'ingress', 'egress'].map(d => (
                  <button key={d} onClick={() => setFilterDir(d)}
                    style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, background: filterDir === d ? 'rgba(0,255,200,.1)' : 'transparent', border: `1px solid ${filterDir === d ? 'var(--accent)' : 'var(--border)'}`, color: filterDir === d ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', letterSpacing: 1 }}>
                    {d.toUpperCase()}
                  </button>
                ))}
                <button className="ui-btn primary" onClick={() => setShowAdd(true)}>+ ADD RULE</button>
              </div>
            </div>

            {/* Rules table */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 80px 100px 1fr 44px', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                {['DIRECTION', 'PROTOCOL', 'PORT', 'REMOTE', ''].map(h => (
                  <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-dim)' }}>{h}</span>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>}
                {!loading && filtered.length === 0 && <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>No rules. Click + ADD RULE to get started.</div>}
                {filtered.map(r => <RuleRow key={r.id} rule={r} onDelete={deleteRule} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}