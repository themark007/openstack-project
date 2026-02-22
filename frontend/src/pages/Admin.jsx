// src/pages/Admin.jsx
import { useState } from "react";
import { useStore } from "../hooks/useStore";
import { identity, compute as computeApi } from "../api/openstack.js";
import { Table, Btn, Modal, Field, Input, Select, Badge, IconBtn, ConfirmModal, SectionHeader, StatCard, Mono } from "../components/UI.jsx";

// ── Hypervisors ───────────────────────────────────────────────────────────────
export function Hypervisors() {
  const { state, load } = useStore();

  const pct = (used, total) => total > 0 ? Math.min(Math.round((used/total)*100), 100) : 0;
  const barColor = (p) => p > 85 ? "#ff4466" : p > 60 ? "#ffaa00" : "#00ff88";

  const cols = [
    { key:"hypervisor_hostname", label:"HOST", w:"1fr", render:v=><span className="cell-primary">{v}</span> },
    { key:"hypervisor_type",     label:"TYPE", w:"100px", render:v=><Badge label={v} color="#00aaff" /> },
    { key:"state",  label:"STATE", w:"80px",  render:v=><span style={{color:v==="up"?"#00ff88":"#ff4466",fontWeight:700}}>{v?.toUpperCase()}</span> },
    { key:"status", label:"STATUS", w:"90px", render:v=><span style={{color:v==="enabled"?"#00ff88":"#888"}}>{v}</span> },
    { key:"vcpus",  label:"vCPU", w:"130px", render:(v,r)=>{
      const p=pct(r.vcpus_used,v);
      return <div><div style={{fontSize:10,marginBottom:3}}>{r.vcpus_used}/{v} ({p}%)</div><div style={{height:5,background:"#0c1518",borderRadius:3}}><div style={{height:"100%",width:p+"%",background:barColor(p),borderRadius:3,transition:"width .5s"}}/></div></div>;
    }},
    { key:"memory_mb", label:"RAM", w:"130px", render:(v,r)=>{
      const used=Math.round((r.memory_mb_used||0)/1024); const total=Math.round(v/1024); const p=pct(r.memory_mb_used,v);
      return <div><div style={{fontSize:10,marginBottom:3}}>{used}/{total}GB ({p}%)</div><div style={{height:5,background:"#0c1518",borderRadius:3}}><div style={{height:"100%",width:p+"%",background:barColor(p),borderRadius:3,transition:"width .5s"}}/></div></div>;
    }},
    { key:"disk_available_least", label:"FREE DISK", w:"100px", render:v=><span>{v||0} GB</span> },
    { key:"running_vms", label:"VMs", w:"60px" },
  ];

  return (
    <div className="page">
      <SectionHeader title="HYPERVISORS" actions={<Btn onClick={()=>load("hypervisors",computeApi.hypervisors)}>↻ REFRESH</Btn>} />
      <Table cols={cols} rows={state.hypervisors} empty="No hypervisor data available." loading={state.loading.hypervisors} />
    </div>
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────
export function Projects() {
  const { state, load, toast } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:"", description:"", enabled:true });
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const create = async () => {
    if (!form.name) { toast("Name required","error"); return; }
    setLoading(true);
    try { await identity.createProject({ project: { name:form.name, description:form.description, enabled:form.enabled }}); toast("Project created!","ok"); setShowCreate(false); load("projects",identity.projects); }
    catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  const del = (p) => setConfirm({
    title:"DELETE PROJECT", message:`Delete project "${p.name}"? This may impact existing resources.`, danger:true,
    onConfirm: async()=>{
      try { await identity.deleteProject(p.id); toast(`${p.name} deleted`,"ok"); load("projects",identity.projects); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const cols = [
    { key:"name",        label:"NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v}</div><div className="cell-mono">{r.id?.slice(0,24)}…</div></div> },
    { key:"description", label:"DESCRIPTION", w:"1fr", render:v=><span className="cell-dim">{v||"—"}</span> },
    { key:"enabled",     label:"STATUS", w:"90px", render:v=><span style={{color:v?"#00ff88":"#ff4466"}}>{v?"ENABLED":"DISABLED"}</span> },
    { key:"domain_id",   label:"DOMAIN", w:"160px", render:v=><Mono>{v?.slice(0,16)}</Mono> },
    { key:"actions",     label:"ACTIONS", w:"80px", render:(_,r)=><IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} /> },
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {showCreate && (
        <Modal title="CREATE PROJECT" onClose={()=>setShowCreate(false)}>
          <div className="form-grid">
            <Field label="NAME *"><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></Field>
            <Field label="DESCRIPTION"><Input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></Field>
          </div>
          <div className="modal-footer"><Btn onClick={()=>setShowCreate(false)}>CANCEL</Btn><Btn variant="primary" loading={loading} onClick={create}>CREATE</Btn></div>
        </Modal>
      )}
      <SectionHeader title="PROJECTS" actions={
        <><Btn onClick={()=>load("projects",identity.projects)}>↻ REFRESH</Btn><Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE PROJECT</Btn></>
      } />
      <Table cols={cols} rows={state.projects} empty="No projects found." loading={state.loading.projects} />
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
export function Users() {
  const { state, load, toast } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", password:"", enabled:true });
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const create = async () => {
    if (!form.name||!form.password) { toast("Name and password required","error"); return; }
    setLoading(true);
    try { await identity.createUser({ user:{ name:form.name, email:form.email, password:form.password, enabled:form.enabled }}); toast("User created!","ok"); setShowCreate(false); load("users",identity.users); }
    catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  const del = (u) => setConfirm({
    title:"DELETE USER", message:`Delete user "${u.name}"?`, danger:true,
    onConfirm: async()=>{
      try { await identity.deleteUser(u.id); toast(`${u.name} deleted`,"ok"); load("users",identity.users); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const cols = [
    { key:"name",    label:"USERNAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v}</div><div className="cell-mono">{r.id?.slice(0,24)}…</div></div> },
    { key:"email",   label:"EMAIL", w:"200px", render:v=><span className="cell-dim">{v||"—"}</span> },
    { key:"enabled", label:"STATUS", w:"90px", render:v=><span style={{color:v?"#00ff88":"#ff4466"}}>{v?"ACTIVE":"DISABLED"}</span> },
    { key:"domain_id",label:"DOMAIN", w:"150px", render:v=><Mono>{v?.slice(0,14)}</Mono> },
    { key:"actions", label:"ACTIONS", w:"80px", render:(_,r)=><IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} /> },
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {showCreate && (
        <Modal title="CREATE USER" onClose={()=>setShowCreate(false)}>
          <div className="form-grid">
            <Field label="USERNAME *"><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></Field>
            <Field label="EMAIL"><Input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} /></Field>
            <Field label="PASSWORD *"><Input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} /></Field>
          </div>
          <div className="modal-footer"><Btn onClick={()=>setShowCreate(false)}>CANCEL</Btn><Btn variant="primary" loading={loading} onClick={create}>CREATE USER</Btn></div>
        </Modal>
      )}
      <SectionHeader title="USERS" actions={
        <><Btn onClick={()=>load("users",identity.users)}>↻ REFRESH</Btn><Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE USER</Btn></>
      } />
      <Table cols={cols} rows={state.users} empty="No users found." loading={state.loading.users} />
    </div>
  );
}

// ── API Endpoints ─────────────────────────────────────────────────────────────
export function Endpoints() {
  const { state, load } = useStore();
  const [filter, setFilter] = useState("public");

  const filtered = state.endpoints?.filter(e => filter==="all"||e.interface===filter) || [];
  const getService = (id) => state.services?.find(s=>s.id===id);

  const cols = [
    { key:"service",   label:"SERVICE", w:"130px", render:(_,r)=><span className="cell-primary">{getService(r.service_id)?.name||"—"}</span> },
    { key:"type",      label:"TYPE", w:"110px",    render:(_,r)=><Badge label={getService(r.service_id)?.type||"—"} color="#aa44ff" /> },
    { key:"interface", label:"INTERFACE", w:"100px", render:v=><Badge label={v?.toUpperCase()} color={v==="public"?"#00ffcc":v==="admin"?"#ff4466":"#00aaff"} /> },
    { key:"region_id", label:"REGION", w:"100px" },
    { key:"url",       label:"URL", w:"1fr", render:v=><span className="cell-mono" style={{fontSize:10,color:"#00aaff"}}>{v}</span> },
    { key:"enabled",   label:"ENABLED", w:"80px", render:v=><span style={{color:v?"#00ff88":"#ff4466"}}>{v?"YES":"NO"}</span> },
  ];

  return (
    <div className="page">
      <SectionHeader title="API ENDPOINTS" actions={
        <>
          <div className="filter-tabs">
            {["public","internal","admin","all"].map(f=>(
              <button key={f} className={`filter-tab ${filter===f?"active":""}`} onClick={()=>setFilter(f)}>{f.toUpperCase()}</button>
            ))}
          </div>
          <Btn onClick={()=>{load("services",identity.services);load("endpoints",identity.endpoints);}}>↻ REFRESH</Btn>
        </>
      } />
      <Table cols={cols} rows={filtered} empty="No endpoints found." />
    </div>
  );
}

// ── Quotas ────────────────────────────────────────────────────────────────────
export function Quotas() {
  const { state, load } = useStore();
  const { quota } = state;

  const items = quota ? [
    { label:"Instances",        used:quota.instances?.in_use,      max:quota.instances?.limit },
    { label:"vCPUs",            used:quota.cores?.in_use,          max:quota.cores?.limit },
    { label:"RAM (MB)",         used:quota.ram?.in_use,            max:quota.ram?.limit },
    { label:"Key Pairs",        used:quota.key_pairs?.in_use,      max:quota.key_pairs?.limit },
    { label:"Security Groups",  used:quota.security_groups?.in_use,max:quota.security_groups?.limit },
    { label:"Floating IPs",     used:quota.floating_ips?.in_use,   max:quota.floating_ips?.limit },
    { label:"Networks",         used:quota.networks?.in_use,       max:quota.networks?.limit },
    { label:"Subnets",          used:quota.subnets?.in_use,        max:quota.subnets?.limit },
    { label:"Ports",            used:quota.ports?.in_use,          max:quota.ports?.limit },
    { label:"Routers",          used:quota.router?.in_use,         max:quota.router?.limit },
    { label:"Volumes",          used:quota.volumes?.in_use,        max:quota.volumes?.limit },
    { label:"Volume Storage GB",used:quota.gigabytes?.in_use,      max:quota.gigabytes?.limit },
  ] : [];

  const barColor = (used,max) => { if (!max||max<0) return "#888"; const p=(used/max)*100; return p>85?"#ff4466":p>60?"#ffaa00":"#00ff88"; };

  return (
    <div className="page">
      <SectionHeader title="QUOTA MANAGEMENT" actions={<Btn onClick={()=>load("quota",()=>computeApi.quota(state.auth?.project?.id))}>↻ REFRESH</Btn>} />
      {!quota && <div className="empty-state"><div className="empty-icon">▥</div><div>Loading quota data…</div></div>}
      <div className="quotas-grid">
        {items.filter(i=>i.used!==undefined).map(item=>{
          const pct = item.max>0 ? Math.min(Math.round((item.used/item.max)*100),100) : 0;
          const color = barColor(item.used,item.max);
          return (
            <div key={item.label} className="quota-card">
              <div className="quota-card-label">{item.label}</div>
              <div className="quota-card-nums" style={{color}}>{item.used} <span>/ {item.max<0?"∞":item.max}</span></div>
              <div className="quota-card-track">
                <div className="quota-card-fill" style={{width:`${item.max<0?0:pct}%`,background:color}} />
              </div>
              <div className="quota-card-pct" style={{color}}>{item.max<0?"Unlimited":`${pct}%`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

