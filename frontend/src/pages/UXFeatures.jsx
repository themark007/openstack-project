// src/pages/UXFeatures.jsx
// Feature 1: Instance Action History / Event Log
// Feature 2: Global Quick Search (command palette)
// Feature 3: Resource Tagging Panel
// Feature 4: Cloud Cost Estimator
// Feature 5: Bulk Instance Actions

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../hooks/useStore.jsx";
import { GET, POST } from "../api/client.js";
import { Btn, Modal, IconBtn, Badge, SectionHeader, Mono, Spinner } from "../components/UI.jsx";
import { compute } from "../api/openstack.js";

// ─── FEATURE 1: Instance Event History ───────────────────────────────────────
export function InstanceEvents({ server, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    GET(`/compute/servers/${server.id}/actions`)
      .then(d => setEvents(Array.isArray(d)?d:[]))
      .catch(()=>setEvents([]))
      .finally(()=>setLoading(false));
  },[server.id]);

  const actionColor = a => ({
    'create':'#00ff88','delete':'#ff4466','stop':'#ffaa00','start':'#00aaff',
    'reboot':'#aa44ff','pause':'#888','unpause':'#00ff88','suspend':'#ff8800','resume':'#00ff88',
  })[a?.toLowerCase()] || '#888';

  return (
    <Modal title={`ACTION HISTORY — ${server.name}`} onClose={onClose} wide>
      {loading && <div style={{padding:30,textAlign:"center"}}><Spinner /></div>}
      {!loading && events.length===0 && <div className="empty-state"><div className="empty-icon">☰</div><div>No action history</div></div>}
      {!loading && events.length>0 && (
        <div style={{maxHeight:420,overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"140px 110px 1fr 120px",padding:"8px 12px",background:"var(--surface2)",borderBottom:"1px solid var(--border)",fontSize:9,fontWeight:700,letterSpacing:2,color:"var(--text-dim)"}}>
            <span>TIME</span><span>ACTION</span><span>REQUEST ID</span><span>USER</span>
          </div>
          {events.map((e,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"140px 110px 1fr 120px",padding:"9px 12px",borderBottom:"1px solid var(--border)",alignItems:"center",fontSize:11}}>
              <span style={{color:"var(--text-dim)",fontFamily:"var(--font-mono)",fontSize:10}}>{new Date(e.start_time||e.created_at).toLocaleString()}</span>
              <span style={{color:actionColor(e.action),fontWeight:700,letterSpacing:1}}>{e.action?.toUpperCase()}</span>
              <Mono>{e.request_id?.slice(0,32)||"—"}</Mono>
              <span style={{color:"var(--text-dim)",fontSize:10}}>{e.user_id?.slice(0,14)||"—"}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── FEATURE 2: Global Quick Search (Command Palette) ────────────────────────
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const open_ = () => setOpen(true);
  const close_ = () => setOpen(false);

  useEffect(()=>{
    const fn = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(o=>!o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  },[]);

  return { open, open_, close_ };
}

export function CommandPalette({ onClose, onNavigate }) {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(()=>{ inputRef.current?.focus(); },[]);

  const allItems = [
    // Pages
    ...["overview","compute","network","routers","secgroups","floatingips","volumes","images","keypairs","topology","hypervisors","projects","users","endpoints","quotas","magnum","heat"].map(id=>({type:"page",id,label:id.toUpperCase(),icon:"◎",nav:id})),
    // Instances
    ...state.servers.map(s=>({type:"instance",id:s.id,label:s.name,sub:s.status+" · "+Object.values(s.addresses||{}).flat().map(a=>a.addr).join(", "),icon:"⚡",nav:"compute"})),
    // Networks
    ...state.networks.map(n=>({type:"network",id:n.id,label:n.name,sub:"Network",icon:"◈",nav:"network"})),
    // Images
    ...state.images.map(i=>({type:"image",id:i.id,label:i.name,sub:i.status,icon:"◉",nav:"images"})),
  ];

  const filtered = query.trim().length === 0
    ? allItems.filter(i=>i.type==="page").slice(0,8)
    : allItems.filter(i=>i.label?.toLowerCase().includes(query.toLowerCase())||i.sub?.toLowerCase().includes(query.toLowerCase())).slice(0,10);

  const typeColors = { page:"#888", instance:"#00ff88", network:"#00aaff", image:"#aa44ff", volume:"#ffaa00" };

  const handleKey = (e) => {
    if (e.key==="ArrowDown") { e.preventDefault(); setSelected(s=>Math.min(s+1,filtered.length-1)); }
    if (e.key==="ArrowUp")   { e.preventDefault(); setSelected(s=>Math.max(s-1,0)); }
    if (e.key==="Enter" && filtered[selected]) { onNavigate(filtered[selected].nav); onClose(); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div style={{background:"var(--surface)",border:"1px solid var(--border-hi)",width:560,maxHeight:500,display:"flex",flexDirection:"column",boxShadow:"0 0 60px rgba(0,255,200,.15)"}} onClick={e=>e.stopPropagation()}>
        {/* Search input */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
          <span style={{fontSize:18,color:"var(--accent)"}}>⌕</span>
          <input ref={inputRef} className="ui-input" value={query} onChange={e=>{setQuery(e.target.value);setSelected(0);}}
            onKeyDown={handleKey} placeholder="Search instances, networks, images, or navigate…"
            style={{border:"none",background:"transparent",fontSize:14,flex:1,outline:"none"}} />
          <span style={{fontSize:10,color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>ESC</span>
        </div>

        {/* Results */}
        <div style={{overflowY:"auto"}}>
          {filtered.length===0 && <div className="empty-state" style={{padding:24}}><div>No results for "{query}"</div></div>}
          {filtered.map((item,i)=>(
            <div key={item.id} className={i===selected?"cmd-item active":"cmd-item"}
              style={{padding:"10px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",
                background:i===selected?"rgba(0,255,200,.06)":"transparent",transition:"background .1s"}}
              onClick={()=>{onNavigate(item.nav);onClose();}}
              onMouseEnter={()=>setSelected(i)}>
              <span style={{fontSize:16,color:typeColors[item.type]||"#888"}}>{item.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600}}>{item.label}</div>
                {item.sub&&<div style={{fontSize:10,color:"var(--text-dim)",fontFamily:"var(--font-mono)",marginTop:2}}>{item.sub}</div>}
              </div>
              <span style={{fontSize:9,color:"var(--text-dim)",letterSpacing:1}}>{item.type.toUpperCase()}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{padding:"8px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:16,fontSize:10,color:"var(--text-dim)"}}>
          <span>↑↓ navigate</span><span>↵ select</span><span>ESC close</span><span style={{marginLeft:"auto"}}>Ctrl+K to toggle</span>
        </div>
      </div>
    </div>
  );
}

// ─── FEATURE 3: Resource Tag Manager ─────────────────────────────────────────
// Tags are stored locally (OpenStack Nova metadata API)
export function TagManager({ server, onClose }) {
  const { toast } = useStore();
  const [tags, setTags] = useState(Object.entries(server.metadata||{}).map(([k,v])=>({k,v})));
  const [newTag, setNewTag] = useState({k:"",v:""});
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const metadata = {};
      tags.forEach(t=>{ if(t.k) metadata[t.k]=t.v; });
      await POST(`/compute/servers/${server.id}/action`, { setMetadata: { metadata } });
      toast("Tags saved!","ok");
      onClose();
    } catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  const addTag = () => {
    if (!newTag.k) return;
    setTags(t=>[...t, {...newTag}]);
    setNewTag({k:"",v:""});
  };

  const removeTag = (i) => setTags(t=>t.filter((_,idx)=>idx!==i));

  return (
    <Modal title={`METADATA TAGS — ${server.name}`} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
        {tags.map((t,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
            <input className="ui-input" value={t.k} onChange={e=>setTags(ts=>ts.map((x,j)=>j===i?{...x,k:e.target.value}:x))} placeholder="key" style={{flex:1}} />
            <span style={{color:"var(--text-dim)"}}>:</span>
            <input className="ui-input" value={t.v} onChange={e=>setTags(ts=>ts.map((x,j)=>j===i?{...x,v:e.target.value}:x))} placeholder="value" style={{flex:2}} />
            <button style={{background:"transparent",border:"1px solid rgba(255,68,102,.3)",color:"#ff4466",width:26,height:26,cursor:"pointer"}} onClick={()=>removeTag(i)}>✕</button>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,alignItems:"center",padding:"10px 0",borderTop:"1px solid var(--border)"}}>
        <input className="ui-input" value={newTag.k} onChange={e=>setNewTag(p=>({...p,k:e.target.value}))} placeholder="new key" style={{flex:1}} />
        <span style={{color:"var(--text-dim)"}}>:</span>
        <input className="ui-input" value={newTag.v} onChange={e=>setNewTag(p=>({...p,v:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTag()} placeholder="value" style={{flex:2}} />
        <Btn variant="primary" onClick={addTag}>+ ADD</Btn>
      </div>

      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={save}>SAVE TAGS</Btn>
      </div>
    </Modal>
  );
}

// ─── FEATURE 4: Cloud Cost Estimator ─────────────────────────────────────────
// Simple pricing estimator based on flavor size
const PRICE_PER_VCPU_HR  = 0.024; // USD
const PRICE_PER_GB_RAM_HR= 0.008;
const PRICE_PER_GB_DISK_HR=0.0001;

export function CostEstimator({ onClose }) {
  const { state } = useStore();
  const [hoursPerMonth] = useState(730);

  const serverCosts = state.servers.map(s => {
    const flavor = state.flavors.find(f=>f.id===s.flavor?.id) || { vcpus:0, ram:0, disk:0 };
    const hrCost = flavor.vcpus*PRICE_PER_VCPU_HR + (flavor.ram/1024)*PRICE_PER_GB_RAM_HR + flavor.disk*PRICE_PER_GB_DISK_HR;
    return { name:s.name, status:s.status, flavor:flavor.name||s.flavor?.original_name||"?",
      vcpus:flavor.vcpus, ram:Math.round(flavor.ram/1024), disk:flavor.disk,
      hrCost, monthlyCost: hrCost*hoursPerMonth, active:s.status==="ACTIVE" };
  });

  const totalHr = serverCosts.filter(s=>s.active).reduce((a,s)=>a+s.hrCost,0);
  const totalMonthly = totalHr*hoursPerMonth;
  const volCost = state.volumes.reduce((a,v)=>a+(v.size||0)*PRICE_PER_GB_DISK_HR*hoursPerMonth,0);

  return (
    <Modal title="COST ESTIMATOR" onClose={onClose} wide>
      <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:14,padding:"8px 12px",background:"var(--surface2)",border:"1px solid var(--border)"}}>
        ⚠ Estimated costs based on standard cloud pricing. Actual costs depend on your OpenStack configuration.
      </div>

      {/* Summary */}
      <div className="stats-grid" style={{marginBottom:16}}>
        <div className="stat-card">
          <div className="stat-icon" style={{color:"#00ffcc"}}>$/hr</div>
          <div className="stat-val" style={{color:"#00ffcc"}}>${totalHr.toFixed(3)}</div>
          <div className="stat-label">HOURLY COST</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{color:"#00aaff"}}>$/mo</div>
          <div className="stat-val" style={{color:"#00aaff"}}>${(totalMonthly+volCost).toFixed(2)}</div>
          <div className="stat-label">MONTHLY ESTIMATE</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{color:"#aa44ff"}}>VOL</div>
          <div className="stat-val" style={{color:"#aa44ff"}}>${volCost.toFixed(2)}</div>
          <div className="stat-label">VOLUME STORAGE/mo</div>
        </div>
      </div>

      {/* Per-instance breakdown */}
      <div style={{fontSize:9,letterSpacing:2,color:"var(--text-dim)",marginBottom:8,fontWeight:700}}>PER-INSTANCE BREAKDOWN</div>
      <div className="data-table">
        <div className="table-head" style={{gridTemplateColumns:"1fr 90px 60px 60px 60px 80px 90px"}}>
          <span>INSTANCE</span><span>FLAVOR</span><span>CPU</span><span>RAM</span><span>DISK</span><span>$/HOUR</span><span>$/MONTH</span>
        </div>
        {serverCosts.map(s=>(
          <div key={s.name} className="table-row" style={{gridTemplateColumns:"1fr 90px 60px 60px 60px 80px 90px"}}>
            <div>
              <div className="cell-primary">{s.name}</div>
              <div className="cell-mono" style={{color:s.active?"#00ff88":"#ff4466"}}>{s.status}</div>
            </div>
            <div className="cell-dim">{s.flavor}</div>
            <div>{s.vcpus}</div>
            <div>{s.ram}GB</div>
            <div>{s.disk}GB</div>
            <div style={{color:"#00aaff",fontFamily:"var(--font-mono)"}}>{s.active?`$${s.hrCost.toFixed(4)}`:"OFF"}</div>
            <div style={{color:"#00ffcc",fontWeight:700,fontFamily:"var(--font-mono)"}}>{s.active?`$${s.monthlyCost.toFixed(2)}`:"—"}</div>
          </div>
        ))}
        {serverCosts.length===0&&<div className="table-empty">No instances to estimate</div>}
      </div>
    </Modal>
  );
}

// ─── FEATURE 5: Bulk Instance Actions ────────────────────────────────────────
export function BulkActions({ servers, onDone, onClose }) {
  const { toast, load } = useStore();
  const [selected, setSelected] = useState(new Set());
  const [action, setAction] = useState("stop");
  const [loading, setLoading] = useState(false);

  const toggle = (id) => setSelected(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => { if(selected.size===servers.length) setSelected(new Set()); else setSelected(new Set(servers.map(s=>s.id))); };

  const actionBodies = {
    stop:    {"os-stop":null},
    start:   {"os-start":null},
    reboot:  {reboot:{type:"SOFT"}},
    hreboot: {reboot:{type:"HARD"}},
    pause:   {pause:null},
    unpause: {unpause:null},
    suspend: {suspend:null},
  };

  const execute = async () => {
    if (selected.size===0) { toast("Select at least one instance","warn"); return; }
    setLoading(true);
    let ok=0, fail=0;
    await Promise.all([...selected].map(async id => {
      try { await POST(`/compute/servers/${id}/action`, actionBodies[action]); ok++; }
      catch(e){ fail++; }
    }));
    toast(`Bulk ${action}: ${ok} succeeded${fail?`, ${fail} failed`:""}`, fail>0?"warn":"ok");
    setTimeout(()=>{ load("servers",compute.servers); }, 2000);
    onDone();
    setLoading(false);
  };

  const statusColor = s=>({ACTIVE:"#00ff88",SHUTOFF:"#ff4466",BUILD:"#ffaa00",ERROR:"#ff0055",PAUSED:"#8888ff"})[s]||"#888";

  return (
    <Modal title="BULK INSTANCE ACTIONS" onClose={onClose} wide>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <div style={{fontSize:11,color:"var(--text-dim)"}}>ACTION:</div>
        {Object.keys(actionBodies).map(a=>(
          <button key={a} className={`preset-btn ${action===a?"active":""}`}
            style={{...(action===a?{borderColor:"var(--accent)",color:"var(--accent)",background:"rgba(0,255,200,.08)"}:{})}}
            onClick={()=>setAction(a)}>{a.toUpperCase()}</button>
        ))}
      </div>

      <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" checked={selected.size===servers.length} onChange={toggleAll} style={{accentColor:"var(--accent)"}} />
        <span style={{fontSize:11,color:"var(--text-dim)"}}>SELECT ALL ({selected.size}/{servers.length} selected)</span>
      </div>

      <div style={{maxHeight:340,overflowY:"auto",border:"1px solid var(--border)"}}>
        {servers.map(s=>(
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 14px",borderBottom:"1px solid var(--border)",cursor:"pointer",background:selected.has(s.id)?"rgba(0,255,200,.04)":"transparent"}}
            onClick={()=>toggle(s.id)}>
            <input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)} style={{accentColor:"var(--accent)"}} />
            <span style={{width:8,height:8,borderRadius:"50%",background:statusColor(s.status),boxShadow:`0 0 5px ${statusColor(s.status)}`,flexShrink:0,display:"inline-block"}}/>
            <span style={{flex:1,fontSize:12,fontWeight:600}}>{s.name}</span>
            <span style={{color:statusColor(s.status),fontWeight:700,fontSize:11,letterSpacing:1}}>{s.status}</span>
            <span className="cell-dim" style={{fontSize:10}}>{s.flavor?.original_name||"—"}</span>
          </div>
        ))}
      </div>

      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={execute}
          disabled={selected.size===0}>
          APPLY {action.toUpperCase()} TO {selected.size} INSTANCE{selected.size!==1?"S":""}
        </Btn>
      </div>
    </Modal>
  );
}
