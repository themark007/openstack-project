// src/pages/InstanceDetail.jsx
// Full dedicated page for a single instance — click any row in Compute to open
import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../hooks/useStore.js';
import { GET, POST, PUT, DEL } from '../api/client.js';
import { compute } from '../api/openstack.js';
import SSHTerminal from '../components/SSHTerminal.jsx';
import { VNCConsole, InstanceReset, AutoFloatingIP } from '../components/VNCConsole.jsx';

const SC = { ACTIVE:'#00ff88', SHUTOFF:'#ff4466', BUILD:'#ffaa00', ERROR:'#ff0055', PAUSED:'#8888ff', SUSPENDED:'#ff6600', VERIFY_RESIZE:'#00aaff', RESIZE:'#00aaff', REBOOT:'#ffaa00' };
const sc = s => SC[s] || '#888';

// ── Small reusable atoms ─────────────────────────────────────────────────────
const Pill = ({ label, color = '#888' }) => (
  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px', border: `1px solid ${color}`, color, background: `${color}18`, borderRadius: 'var(--radius)', whiteSpace: 'nowrap' }}>
    {label}
  </span>
);
const Row = ({ k, v, mono }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '8px 0', gap: 12 }}>
    <span style={{ width: 160, flexShrink: 0, fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{k}</span>
    <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', wordBreak: 'break-all' }}>{v ?? '—'}</span>
  </div>
);
const Card = ({ title, icon, children, style }) => (
  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', ...style }}>
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,255,200,.02)' }}>
      <span style={{ color: 'var(--accent)', fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--text-dim)' }}>{title}</span>
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
);
const Btn = ({ children, onClick, variant, disabled, title, small }) => (
  <button className={`ui-btn ${variant === 'primary' ? 'primary' : ''}`}
    onClick={onClick} disabled={disabled} title={title}
    style={{ fontSize: small ? 11 : 12, padding: small ? '5px 10px' : '7px 14px' }}>
    {children}
  </button>
);

// ── Resize Modal ─────────────────────────────────────────────────────────────
function ResizeModal({ server, onClose, toast, onDone }) {
  const { state } = useStore();
  const [flavorId, setFlavorId] = useState('');
  const [loading, setLoading]   = useState(false);

  const current = state.flavors.find(f => f.id === server.flavor?.id);
  const others  = state.flavors.filter(f => f.id !== server.flavor?.id);

  const doResize = async () => {
    if (!flavorId) { toast('Select a flavor', 'error'); return; }
    setLoading(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, { resize: { flavorRef: flavorId } });
      toast(`Resize started for ${server.name}. Confirm resize when status becomes VERIFY_RESIZE.`, 'ok');
      onDone();
    } catch(e) { toast(`Resize failed: ${e.message}`, 'error'); }
    setLoading(false);
  };

  const confirmResize = async () => {
    setLoading(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, { confirmResize: null });
      toast('Resize confirmed!', 'ok'); onDone();
    } catch(e) { toast(e.message, 'error'); }
    setLoading(false);
  };

  const revertResize = async () => {
    setLoading(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, { revertResize: null });
      toast('Resize reverted.', 'ok'); onDone();
    } catch(e) { toast(e.message, 'error'); }
    setLoading(false);
  };

  // If already in VERIFY_RESIZE state, show confirm/revert only
  if (server.status === 'VERIFY_RESIZE') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
          <div className="modal-title"><span>CONFIRM RESIZE — {server.name}</span><button className="modal-close" onClick={onClose}>✕</button></div>
          <div style={{ padding: 20 }}>
            <div style={{ padding: '12px 14px', background: 'rgba(0,170,255,.06)', border: '1px solid rgba(0,170,255,.2)', fontSize: 12, color: 'var(--info)', marginBottom: 16, borderRadius: 'var(--radius)' }}>
              Instance is awaiting resize confirmation. Confirm to complete the resize, or revert to go back to the original flavor.
            </div>
          </div>
          <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px' }}>
            <Btn onClick={onClose}>CANCEL</Btn>
            <Btn onClick={revertResize} disabled={loading}>↺ REVERT</Btn>
            <Btn variant="primary" onClick={confirmResize} disabled={loading}>{loading ? '…' : '✓ CONFIRM RESIZE'}</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title"><span>RESIZE INSTANCE — {server.name}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <div style={{ padding: 20 }}>
          {current && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>CURRENT FLAVOR</div>
              <div style={{ padding: '10px 14px', background: 'rgba(0,255,200,.04)', border: '1px solid var(--border-hi)', display: 'flex', gap: 16 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{current.name}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>⚡ {current.vcpus} vCPU · ◈ {Math.round(current.ram/1024)}GB · ◉ {current.disk}GB</span>
              </div>
            </div>
          )}
          <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>SELECT NEW FLAVOR</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {others.map(f => {
              const sel = flavorId === f.id;
              const bigger = current && (f.vcpus > current.vcpus || f.ram > current.ram);
              const smaller = current && (f.vcpus < current.vcpus || f.ram < current.ram);
              return (
                <div key={f.id} onClick={() => setFlavorId(f.id)}
                  style={{ padding: '10px 14px', border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, background: sel ? 'rgba(0,255,200,.06)' : 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all .15s' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: sel ? 'var(--accent)' : 'var(--text)', fontSize: 12 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>⚡ {f.vcpus} vCPU · ◈ {Math.round(f.ram/1024)}GB RAM · ◉ {f.disk}GB disk</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {bigger  && <Pill label="↑ BIGGER"  color="#00ff88" />}
                    {smaller && <Pill label="↓ SMALLER" color="#ffaa00" />}
                    {sel && <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,170,0,.06)', border: '1px solid rgba(255,170,0,.2)', fontSize: 11, color: 'var(--warn)', borderRadius: 'var(--radius)' }}>
            ⚠ Instance will be restarted. After resize, status becomes VERIFY_RESIZE — you must confirm or revert.
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px' }}>
          <Btn onClick={onClose}>CANCEL</Btn>
          <Btn variant="primary" onClick={doResize} disabled={loading || !flavorId}>{loading ? 'RESIZING…' : '⚡ RESIZE'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── SSH URL Generator ─────────────────────────────────────────────────────────
function SSHUrlGenerator({ server, onClose }) {
  const [username, setUsername]   = useState('root');
  const [useKey,   setUseKey]     = useState(true);
  const [port,     setPort]       = useState('22');
  const [proxyMode, setProxyMode] = useState('direct'); // direct | cloudflared | webssh
  const [copied,   setCopied]     = useState('');

  const ips = Object.values(server.addresses || {}).flat().map(a => a.addr);
  const fips = Object.values(server.addresses || {}).flat().filter(a => a['OS-EXT-IPS:type'] === 'floating').map(a => a.addr);
  const ip = fips[0] || ips[0] || '?';

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const commands = {
    direct: {
      label: 'Direct SSH',
      desc: 'Works on same network as OpenStack (controller/hypervisor access)',
      cmd: `ssh${useKey ? ' -i ~/.ssh/id_rsa' : ''} -p ${port} ${username}@${ip}`,
      note: ip === '?' ? '⚠ No IP found on this instance' : ip.startsWith('10.') || ip.startsWith('192.168.') ? '⚠ Private IP — only works from within your OpenStack network' : '✓ Public IP — accessible from anywhere',
    },
    sshconfig: {
      label: 'SSH Config Entry',
      desc: 'Add to ~/.ssh/config for easy access',
      cmd: `Host ${server.name}\n  HostName ${ip}\n  User ${username}\n  Port ${port}${useKey ? '\n  IdentityFile ~/.ssh/id_rsa' : ''}`,
    },
    sshpass: {
      label: 'With sshpass (password)',
      desc: 'One-liner with password (not recommended for production)',
      cmd: `sshpass -p 'YOUR_PASSWORD' ssh -o StrictHostKeyChecking=no -p ${port} ${username}@${ip}`,
    },
    cloudflared: {
      label: 'Cloudflare Tunnel (remote access)',
      desc: 'Run cloudflared on the controller to expose SSH globally. Anyone with the URL can connect.',
      cmd: `# On controller (one-time setup):\ncloudflared tunnel --url ssh://${ip}:${port}\n\n# Then connect from anywhere:\nssh -o ProxyCommand='cloudflared access ssh --hostname %h' ${username}@YOUR_TUNNEL_URL.trycloudflare.com`,
      note: '✓ Works from any device, any network — free via Cloudflare',
    },
    webssh: {
      label: 'WebSSH2 (browser SSH)',
      desc: 'Deploy webssh2 on controller for browser-based SSH from any device',
      cmd: `# Install on controller:\nnpm install -g webssh2\nwebssh --host 0.0.0.0 --port 2222\n\n# Then access in browser:\nhttp://CONTROLLER_IP:2222/?host=${ip}&port=${port}&username=${username}`,
      note: '✓ Full SSH in browser — no client software needed',
    },
    python: {
      label: 'Python (Paramiko) snippet',
      desc: 'Use from any Python script',
      cmd: `import paramiko\n\nclient = paramiko.SSHClient()\nclient.set_missing_host_key_policy(paramiko.AutoAddPolicy())\nclient.connect('${ip}', port=${port}, username='${username}', password='YOUR_PASS')\n\nstdin, stdout, stderr = client.exec_command('uptime')\nprint(stdout.read().decode())\nclient.close()`,
    },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span>🔗 SSH ACCESS — {server.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Config */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 4 }}>USERNAME</div>
            <input className="ui-input" value={username} onChange={e => setUsername(e.target.value)} style={{ padding: '6px 10px', width: 120 }} />
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 4 }}>PORT</div>
            <input className="ui-input" value={port} onChange={e => setPort(e.target.value)} style={{ padding: '6px 10px', width: 70 }} />
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 4 }}>TARGET IP</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', padding: '6px 0' }}>{ip}</div>
          </div>
          {fips.length > 0 && <div style={{ display: 'flex', alignItems: 'flex-end' }}><Pill label="FLOATING IP ✓" color="#00ff88" /></div>}
          {fips.length === 0 && ip.startsWith('10.') && <div style={{ display: 'flex', alignItems: 'flex-end' }}><Pill label="PRIVATE IP ONLY" color="#ffaa00" /></div>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
          {Object.entries(commands).map(([key, c]) => (
            <button key={key} onClick={() => setProxyMode(key)}
              style={{ padding: '10px 14px', background: 'none', border: 'none', borderBottom: `2px solid ${proxyMode === key ? 'var(--accent)' : 'transparent'}`, color: proxyMode === key ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {Object.entries(commands).filter(([k]) => k === proxyMode).map(([key, c]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>{c.desc}</div>
              {c.note && (
                <div style={{ padding: '8px 12px', background: c.note.startsWith('✓') ? 'rgba(0,255,136,.06)' : 'rgba(255,170,0,.06)', border: `1px solid ${c.note.startsWith('✓') ? 'rgba(0,255,136,.2)' : 'rgba(255,170,0,.2)'}`, fontSize: 11, color: c.note.startsWith('✓') ? 'var(--ok)' : 'var(--warn)', marginBottom: 12, borderRadius: 'var(--radius)' }}>
                  {c.note}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <pre style={{ background: '#010a0c', border: '1px solid var(--border-hi)', padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c8f0e8', overflowX: 'auto', margin: 0, borderRadius: 'var(--radius)', lineHeight: 1.6 }}>
                  {c.cmd}
                </pre>
                <button onClick={() => copy(c.cmd, key)} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,255,200,.1)', border: '1px solid var(--border-hi)', color: copied === key ? 'var(--ok)' : 'var(--accent)', padding: '4px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 700, borderRadius: 'var(--radius)' }}>
                  {copied === key ? '✓ COPIED' : 'COPY'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer" style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            💡 For public internet access, assign a floating IP first, then use Cloudflare Tunnel for secure global access
          </div>
          <Btn onClick={onClose}>CLOSE</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Console Log (auto-refreshing) ─────────────────────────────────────────────
function ConsoleLog({ server }) {
  const [log, setLog]         = useState('');
  const [loading, setLoading] = useState(false);
  const [lines, setLines]     = useState(150);
  const logRef = useRef(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const d = await POST(`/compute/servers/${server.id}/action`, { 'os-getConsoleOutput': { length: lines } });
      setLog(d?.output || '(no output)');
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
    } catch(e) { setLog('Error: ' + e.message); }
    setLoading(false);
  }, [server.id, lines]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 10, color: 'var(--text-dim)' }}>Lines:</label>
          {[50, 150, 500].map(n => (
            <button key={n} onClick={() => setLines(n)} style={{ padding: '3px 8px', fontSize: 10, background: lines === n ? 'rgba(0,255,200,.1)' : 'transparent', border: `1px solid ${lines === n ? 'var(--accent)' : 'var(--border)'}`, color: lines === n ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer' }}>{n}</button>
          ))}
        </div>
        <Btn small onClick={fetch}>{loading ? '…' : '↻ REFRESH'}</Btn>
      </div>
      <pre ref={logRef} style={{ background: '#010a0c', border: '1px solid var(--border)', padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c8f0e8', maxHeight: 320, overflowY: 'auto', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {log || (loading ? 'Loading…' : '(empty)')}
      </pre>
    </div>
  );
}

// ── Action History ────────────────────────────────────────────────────────────
function ActionHistory({ server }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    GET(`/compute/servers/${server.id}/actions`)
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [server.id]);
  if (loading) return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>;
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
      {events.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No actions found.</div>}
      {events.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '7px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{e.start_time ? new Date(e.start_time).toLocaleString() : '—'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{e.action}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{e.user_id?.slice(0, 16)}…</span>
          {e.message && <span style={{ fontSize: 10, color: 'var(--danger)' }}>{e.message}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Security Groups on instance ───────────────────────────────────────────────
function InstanceSGs({ server, refresh }) {
  const { state, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const [sgName, setSgName] = useState('');
  const [loading, setLoading] = useState(false);
  const attached = server.security_groups?.map(sg => sg.name) || [];
  const available = state.secgroups.filter(sg => !attached.includes(sg.name));

  const addSG = async () => {
    if (!sgName) return;
    setLoading(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, { addSecurityGroup: { name: sgName } });
      toast(`Added security group ${sgName}`, 'ok'); refresh();
    } catch(e) { toast(e.message, 'error'); }
    setLoading(false); setAdding(false);
  };
  const removeSG = async (name) => {
    setLoading(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, { removeSecurityGroup: { name } });
      toast(`Removed ${name}`, 'ok'); refresh();
    } catch(e) { toast(e.message, 'error'); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {attached.map(name => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(0,170,255,.06)', border: '1px solid rgba(0,170,255,.2)', borderRadius: 'var(--radius)' }}>
            <span style={{ fontSize: 12, color: 'var(--info)' }}>⬢ {name}</span>
            <button onClick={() => removeSG(name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ))}
        {!adding && <button onClick={() => setAdding(true)} style={{ padding: '4px 10px', background: 'transparent', border: '1px dashed var(--border-hi)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11 }}>+ Add</button>}
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="ui-input" style={{ flex: 1, padding: '6px 10px' }} value={sgName} onChange={e => setSgName(e.target.value)}>
            <option value="">— select security group —</option>
            {available.map(sg => <option key={sg.id} value={sg.name}>{sg.name}</option>)}
          </select>
          <Btn onClick={addSG} disabled={loading || !sgName}>{loading ? '…' : 'ADD'}</Btn>
          <Btn onClick={() => { setAdding(false); setSgName(''); }}>✕</Btn>
        </div>
      )}
    </div>
  );
}

// ── MAIN INSTANCE DETAIL PAGE ─────────────────────────────────────────────────
export default function InstanceDetail({ server: initialServer, onBack }) {
  const { state, toast, load } = useStore();
  const [server, setServer]     = useState(initialServer);
  const [tab, setTab]           = useState('overview');
  const [actLoading, setActL]   = useState(false);

  // Modals
  const [showSSH,      setShowSSH]      = useState(false);
  const [showVNC,      setShowVNC]      = useState(false);
  const [showResize,   setShowResize]   = useState(false);
  const [showReset,    setShowReset]    = useState(false);
  const [showFIP,      setShowFIP]      = useState(false);
  const [showSSHUrl,   setShowSSHUrl]   = useState(false);

  // Refresh this specific server
  const refreshServer = useCallback(async () => {
    try {
      const updated = state.servers.find(s => s.id === server.id);
      if (updated) setServer(updated);
      await load('servers', compute.servers);
    } catch(e) {}
  }, [server.id, state.servers, load]);

  // Keep server in sync when global state changes
  useEffect(() => {
    const updated = state.servers.find(s => s.id === server.id);
    if (updated) setServer(updated);
  }, [state.servers]);

  const act = async (body, label) => {
    setActL(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, body);
      toast(`${label} → ${server.name}`, 'ok');
      setTimeout(refreshServer, 2000);
    } catch(e) { toast(`${label} failed: ${e.message}`, 'error'); }
    setActL(false);
  };

  const deleteServer = async () => {
    if (!confirm(`Delete instance "${server.name}"? This cannot be undone.`)) return;
    try {
      await DEL(`/compute/servers/${server.id}`);
      toast(`${server.name} deleted`, 'ok');
      onBack();
    } catch(e) { toast(e.message, 'error'); }
  };

  const ips = Object.entries(server.addresses || {}).flatMap(([net, addrs]) =>
    addrs.map(a => ({ net, ip: a.addr, type: a['OS-EXT-IPS:type'] }))
  );
  const fips    = ips.filter(i => i.type === 'floating');
  const fixedips= ips.filter(i => i.type === 'fixed');
  const flavor  = state.flavors.find(f => f.id === server.flavor?.id);
  const image   = state.images.find(i => i.id === server.image?.id);
  const s = server.status;

  const TABS = ['overview', 'console log', 'actions history', 'network', 'metadata'];

  return (
    <div className="page">
      {/* Modals */}
      {showSSH    && <SSHTerminal server={server} onClose={() => setShowSSH(false)} />}
      {showVNC    && <VNCConsole  server={server} onClose={() => setShowVNC(false)} />}
      {showResize && <ResizeModal server={server} onClose={() => setShowResize(false)} toast={toast} onDone={() => { setShowResize(false); setTimeout(refreshServer, 2000); }} />}
      {showReset  && <InstanceReset server={server} onClose={() => setShowReset(false)} />}
      {showFIP    && <AutoFloatingIP server={server} onClose={() => { setShowFIP(false); setTimeout(refreshServer, 2000); }} />}
      {showSSHUrl && <SSHUrlGenerator server={server} onClose={() => setShowSSHUrl(false)} />}

      {/* Back bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid var(--border-hi)', color: 'var(--text-dim)', padding: '6px 12px', cursor: 'pointer', fontSize: 11, letterSpacing: 1 }}>
          ← BACK
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc(server.status) }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: 1 }}>{server.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>{server.id}</span>
          <Pill label={server.status} color={sc(server.status)} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {actLoading && <span style={{ fontSize: 11, color: 'var(--warn)' }}>Working…</span>}
          {s === 'ACTIVE'    && <Btn small onClick={() => act({ 'os-stop': null }, 'Stop')}>⏹ STOP</Btn>}
          {s === 'SHUTOFF'   && <Btn small onClick={() => act({ 'os-start': null }, 'Start')}>▶ START</Btn>}
          {s === 'ACTIVE'    && <Btn small onClick={() => act({ reboot: { type: 'SOFT' } }, 'Reboot')}>↺ REBOOT</Btn>}
          {s === 'ACTIVE'    && <Btn small onClick={() => act({ suspend: null }, 'Suspend')}>⏸ SUSPEND</Btn>}
          {s === 'SUSPENDED' && <Btn small onClick={() => act({ resume: null }, 'Resume')}>▶ RESUME</Btn>}
          {s === 'ACTIVE'    && <Btn small onClick={() => setShowSSH(true)}>⎗ SSH</Btn>}
          {s === 'ACTIVE'    && <Btn small onClick={() => setShowVNC(true)}>⎖ VNC</Btn>}
          <Btn small onClick={() => setShowSSHUrl(true)}>🔗 SSH URL</Btn>
          <Btn small onClick={() => setShowFIP(true)}>◆ FLOAT IP</Btn>
          {(s === 'SHUTOFF' || s === 'VERIFY_RESIZE') && <Btn small onClick={() => setShowResize(true)}>⚡ RESIZE</Btn>}
          {s === 'VERIFY_RESIZE' && <Btn small variant="primary" onClick={() => setShowResize(true)}>✓ CONFIRM RESIZE</Btn>}
          <Btn small onClick={() => setShowReset(true)}>🔑 RESET</Btn>
          <button onClick={deleteServer} style={{ padding: '5px 10px', fontSize: 11, background: 'rgba(255,68,102,.08)', border: '1px solid rgba(255,68,102,.4)', color: 'var(--danger)', cursor: 'pointer' }}>✕ DELETE</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Card title="IDENTITY" icon="⬡">
            <Row k="ID"          v={server.id} mono />
            <Row k="Name"        v={server.name} />
            <Row k="Status"      v={<Pill label={server.status} color={sc(server.status)} />} />
            <Row k="Task State"  v={server['OS-EXT-STS:task_state'] || '—'} />
            <Row k="Power State" v={server['OS-EXT-STS:power_state'] === 1 ? '✓ Running' : '✗ Off'} />
            <Row k="Created"     v={new Date(server.created).toLocaleString()} />
            <Row k="Updated"     v={new Date(server.updated).toLocaleString()} />
          </Card>

          <Card title="COMPUTE" icon="⚡">
            <Row k="Flavor"      v={flavor ? `${flavor.name} (${flavor.vcpus} vCPU, ${Math.round(flavor.ram/1024)}GB)` : server.flavor?.original_name || server.flavor?.id} />
            <Row k="Image"       v={image?.name || server.image?.id || '(volume boot)'} />
            <Row k="Key Pair"    v={server.key_name} />
            <Row k="Host"        v={server['OS-EXT-SRV-ATTR:host']} mono />
            <Row k="Hypervisor"  v={server['OS-EXT-SRV-ATTR:hypervisor_hostname']} mono />
            <Row k="Avail Zone"  v={server['OS-EXT-AZ:availability_zone']} />
          </Card>

          <Card title="NETWORK" icon="◎">
            {fips.map((ip, i) => <Row key={i} k={`Floating (${ip.net})`} v={ip.ip} mono />)}
            {fixedips.map((ip, i) => <Row key={i} k={`Fixed (${ip.net})`} v={ip.ip} mono />)}
            {ips.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No IPs assigned</div>}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>SECURITY GROUPS</div>
              <InstanceSGs server={server} refresh={refreshServer} />
            </div>
          </Card>

          <Card title="SECURITY GROUPS" icon="⬢">
            {(server.security_groups || []).map(sg => (
              <div key={sg.name} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--info)' }}>⬢</span> {sg.name}
              </div>
            ))}
            {(server.security_groups || []).length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No security groups</div>}
          </Card>
        </div>
      )}

      {/* ── CONSOLE LOG TAB ── */}
      {tab === 'console log' && (
        <Card title="CONSOLE OUTPUT" icon="☰">
          <ConsoleLog server={server} />
        </Card>
      )}

      {/* ── ACTION HISTORY TAB ── */}
      {tab === 'actions history' && (
        <Card title="ACTION HISTORY" icon="⊟">
          <ActionHistory server={server} />
        </Card>
      )}

      {/* ── NETWORK TAB ── */}
      {tab === 'network' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="IP ADDRESSES" icon="◎">
            {ips.map((ip, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <Pill label={ip.type.toUpperCase()} color={ip.type === 'floating' ? '#aa44ff' : '#00aaff'} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{ip.ip}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{ip.net}</span>
              </div>
            ))}
            {ips.length === 0 && <div style={{ color: 'var(--text-dim)' }}>No IPs. Add a floating IP with the ◆ FLOAT IP button above.</div>}
          </Card>
          <Card title="SSH ACCESS COMMANDS" icon="🔗">
            <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-dim)' }}>Quick commands to connect to this instance</div>
            {ips.map((ip, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{ip.net} — {ip.type}</div>
                <pre style={{ background: '#010a0c', border: '1px solid var(--border)', padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c8f0e8', margin: 0 }}>ssh root@{ip.ip}</pre>
              </div>
            ))}
            <button onClick={() => setShowSSHUrl(true)} className="ui-btn primary" style={{ marginTop: 8 }}>🔗 Open SSH URL Generator</button>
          </Card>
        </div>
      )}

      {/* ── METADATA TAB ── */}
      {tab === 'metadata' && (
        <Card title="METADATA / TAGS" icon="⊕">
          {Object.keys(server.metadata || {}).length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No metadata set on this instance.</div>}
          {Object.entries(server.metadata || {}).map(([k, v]) => (
            <Row key={k} k={k} v={v} mono />
          ))}
        </Card>
      )}
    </div>
  );
}