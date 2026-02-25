// src/components/VNCConsole.jsx
import { useState, useEffect } from 'react';
import { POST } from '../api/client.js';
import { useStore } from '../hooks/useTheme';

// ── VNC Console ───────────────────────────────────────────────────────────────
export function VNCConsole({ server, onClose }) {
  const [url, setUrl]     = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    POST(`/compute/servers/${server.id}/console`, {})
      .then(d => { if (d?.url) setUrl(d.url); else setError('No console URL from Nova'); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [server.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'92vw',height:'88vh',background:'var(--surface)',
        border:'1px solid var(--border-hi)',display:'flex',flexDirection:'column',
        borderRadius:'var(--radius)',overflow:'hidden',boxShadow:'0 0 80px rgba(0,0,0,.7)',
      }}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid var(--border-hi)',background:'rgba(0,255,200,.03)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:18,color:'var(--accent)'}}>⎖</span>
            <span style={{fontFamily:'var(--font-display)',fontSize:12,letterSpacing:2,color:'var(--accent)',fontWeight:700}}>VNC CONSOLE — {server.name}</span>
          </div>
          <div style={{display:'flex',gap:8}}>
            {url&&<a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',border:'1px solid var(--border-hi)',padding:'5px 10px',textDecoration:'none'}}>⬡ FULL SCREEN</a>}
            <button onClick={onClose} style={{background:'transparent',border:'1px solid rgba(255,68,102,.4)',color:'#ff4466',padding:'5px 12px',cursor:'pointer',fontSize:11,fontWeight:700,borderRadius:'var(--radius)'}}>✕ CLOSE</button>
          </div>
        </div>

        {/* Body */}
        {loading&&(
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
            <div style={{width:40,height:40,border:'3px solid rgba(0,255,200,.2)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
            <span style={{color:'var(--text-dim)',fontSize:12,fontFamily:'var(--font-mono)'}}>Requesting VNC session from Nova…</span>
          </div>
        )}
        {!loading&&error&&(
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
            <div style={{fontSize:32}}>⚠</div>
            <div style={{color:'var(--danger)',fontSize:13}}>{error}</div>
            <div style={{fontSize:11,color:'var(--text-dim)',maxWidth:420,textAlign:'center'}}>
              Ensure <code>nova-novncproxy</code> is running and the VNC proxy URL is reachable from your browser (not just the controller).
            </div>
          </div>
        )}
        {url&&!loading&&(
          <iframe src={url} style={{flex:1,border:'none',background:'#000'}} title={`VNC — ${server.name}`} allow="clipboard-read;clipboard-write" />
        )}
      </div>
    </div>
  );
}

// ── Instance Reset (password + keypair) ────────────────────────────────────────
export function InstanceReset({ server, onClose }) {
  const { state, toast } = useStore();
  const [tab, setTab]       = useState('password');
  const [loading, setLoading] = useState(false);
  const [pw, setPw]         = useState('');
  const [kp, setKp]         = useState('');

  const resetPassword = async () => {
    if (!pw) { toast('Enter a password','error'); return; }
    setLoading(true);
    try {
      await POST(`/compute/servers/${server.id}/action`, { changePassword: { adminPass: pw } });
      toast(`Admin password updated on ${server.name}`,'ok');
      onClose();
    } catch(e) { toast(`Failed: ${e.message}`,'error'); }
    setLoading(false);
  };

  const injectKeypair = async () => {
    if (!kp) { toast('Select a keypair','error'); return; }
    setLoading(true);
    try {
      const found = state.keypairs.find(k=>(k.keypair?.name||k.name)===kp);
      const pubKey = found?.keypair?.public_key || found?.public_key;
      if (!pubKey) { toast('Public key data not found','error'); setLoading(false); return; }
      // Set as metadata — cloud-init can pick this up; also useful as reference
      await POST(`/compute/servers/${server.id}/action`, { setMetadata: { metadata: { injected_keypair_name: kp, injected_public_key: pubKey } } });
      toast(`Keypair metadata set on ${server.name}. Will apply on next cloud-init boot.`,'warn');
      onClose();
    } catch(e) { toast(`Failed: ${e.message}`,'error'); }
    setLoading(false);
  };

  const kpOpts = state.keypairs.map(k=>k.keypair?.name||k.name).filter(Boolean);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{width:460}} onClick={e=>e.stopPropagation()}>
        <div className="modal-title"><span>INSTANCE RESET — {server.name}</span><button className="modal-close" onClick={onClose}>✕</button></div>

        {/* Tabs */}
        <div className="tab-bar" style={{padding:'0 20px'}}>
          <button className={`tab-btn ${tab==='password'?'active':''}`} onClick={()=>setTab('password')}>🔑 PASSWORD</button>
          <button className={`tab-btn ${tab==='keypair'?'active':''}`}  onClick={()=>setTab('keypair')}>🗝 KEYPAIR</button>
        </div>

        <div style={{padding:'20px'}}>
          {tab==='password'&&(
            <>
              <div style={{padding:'10px 12px',background:'rgba(255,170,0,.06)',border:'1px solid rgba(255,170,0,.2)',fontSize:11,color:'var(--warn)',marginBottom:14,borderRadius:'var(--radius)'}}>
                ⚠ Requires qemu-guest-agent running inside the instance.
              </div>
              <div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>NEW ADMIN PASSWORD</div>
              <input type="password" className="ui-input" style={{width:'100%',padding:'9px 12px',boxSizing:'border-box'}}
                value={pw} onChange={e=>setPw(e.target.value)} placeholder="Enter new password"
                onKeyDown={e=>e.key==='Enter'&&resetPassword()} />
            </>
          )}
          {tab==='keypair'&&(
            <>
              <div style={{padding:'10px 12px',background:'rgba(0,170,255,.06)',border:'1px solid rgba(0,170,255,.2)',fontSize:11,color:'var(--info)',marginBottom:14,borderRadius:'var(--radius)'}}>
                ℹ Sets keypair as instance metadata. Applied by cloud-init on next boot.
              </div>
              <div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>SELECT KEYPAIR</div>
              <select className="ui-input" style={{width:'100%',padding:'9px 12px'}} value={kp} onChange={e=>setKp(e.target.value)}>
                <option value="">— select keypair —</option>
                {kpOpts.map(k=><option key={k} value={k}>{k}</option>)}
              </select>
            </>
          )}
        </div>

        <div className="modal-footer" style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 20px'}}>
          <button className="ui-btn" onClick={onClose}>CANCEL</button>
          <button className="ui-btn primary" onClick={tab==='password'?resetPassword:injectKeypair} disabled={loading}>
            {loading?'…':tab==='password'?'SET PASSWORD':'INJECT KEY'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Auto Allocate Floating IP ─────────────────────────────────────────────────
export function AutoFloatingIP({ server, onClose }) {
  const { state, toast } = useStore();
  const [loading, setLoading] = useState(false);
  const [extNet, setExtNet]   = useState('');

  // Find external networks
  const externalNets = state.networks.filter(n => n['router:external']);

  const allocateAndAssociate = async () => {
    setLoading(true);
    try {
      const networkId = extNet || externalNets[0]?.id;
      if (!networkId) { toast('No external network found','error'); setLoading(false); return; }

      // 1. Allocate floating IP
      const { POST: p } = await import('../api/client.js');
      const fip = await p('/network/floatingips', { floating_network_id: networkId });

      // 2. Find the server's port
      const ports = await (await import('../api/client.js')).GET(`/network/ports?device_id=${server.id}`);
      const port  = Array.isArray(ports) ? ports[0] : null;

      // 3. Associate
      if (port) {
        await (await import('../api/client.js')).PUT(`/network/floatingips/${fip.id}`, { port_id: port.id });
        toast(`Floating IP ${fip.floating_ip_address} assigned to ${server.name}!`,'ok');
      } else {
        toast(`Floating IP ${fip.floating_ip_address} allocated but no port found to associate`,'warn');
      }
      onClose();
    } catch(e) { toast(`Failed: ${e.message}`,'error'); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{width:400}} onClick={e=>e.stopPropagation()}>
        <div className="modal-title"><span>AUTO FLOATING IP — {server.name}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <div style={{padding:20}}>
          <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:16}}>
            This will allocate a new floating IP from the selected external network and automatically associate it with this instance.
          </div>
          <div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>EXTERNAL NETWORK</div>
          <select className="ui-input" style={{width:'100%',padding:'9px 12px'}} value={extNet} onChange={e=>setExtNet(e.target.value)}>
            {externalNets.length===0&&<option value="">No external networks found</option>}
            {externalNets.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          {externalNets.length===0&&(
            <div style={{marginTop:10,fontSize:11,color:'var(--danger)'}}>
              ⚠ No external networks (router:external=true) found. Create one in Networks first.
            </div>
          )}
        </div>
        <div className="modal-footer" style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 20px'}}>
          <button className="ui-btn" onClick={onClose}>CANCEL</button>
          <button className="ui-btn primary" onClick={allocateAndAssociate} disabled={loading||externalNets.length===0}>
            {loading?'ALLOCATING…':'⬡ ALLOCATE & ASSIGN'}
          </button>
        </div>
      </div>
    </div>
  );
}