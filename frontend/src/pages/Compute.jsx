// src/pages/Compute.jsx — v2.3: click row → dedicated InstanceDetail page
import { useState, useCallback } from "react";
import { useStore } from "../hooks/useStore";
import { compute } from "../api/openstack.js";
import { Table, Btn, Modal, Field, Input, Select, Toggle, Badge, StatusDot, IconBtn, ConfirmModal, SectionHeader, Mono, Spinner } from "../components/UI.jsx";
import SSHTerminal from "../components/SSHTerminal.jsx";
import { InstanceEvents, TagManager, BulkActions } from "./UXFeatures.jsx";
import InstanceDetail from "./InstanceDetail.jsx";

const statusColor = s => ({ ACTIVE:"#00ff88", SHUTOFF:"#ff4466", BUILD:"#ffaa00", ERROR:"#ff0055", PAUSED:"#8888ff", SUSPENDED:"#ff6600", VERIFY_RESIZE:"#00aaff" })[s] || "#888";

// ── Launch Instance Modal ─────────────────────────────────────────────────────
function LaunchModal({ onClose, onDone }) {
  const { state, toast } = useStore();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name:"", count:1, imageRef:"", flavorRef:"", network_id:"", key_name:"", security_group:"default", az:"", user_data:"" });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const launch = async () => {
    if (!form.name||!form.imageRef||!form.flavorRef) { toast("Name, Image, and Flavor are required","error"); return; }
    setLoading(true);
    try {
      const count = parseInt(form.count)||1;
      await Promise.all(Array.from({length:count},(_,i)=>
        compute.create({ name:count>1?`${form.name}-${i+1}`:form.name, imageRef:form.imageRef, flavorRef:form.flavorRef,
          networks:form.network_id?[{uuid:form.network_id}]:[],
          ...(form.key_name&&{key_name:form.key_name}),
          ...(form.security_group&&{security_groups:[{name:form.security_group}]}),
          ...(form.az&&{availability_zone:form.az}),
          ...(form.user_data&&{user_data:btoa(form.user_data)}),
        })
      ));
      toast(`${count} instance(s) launched!`,"ok");
      onDone();
    } catch(e){ toast(`Launch failed: ${e.message}`,"error"); }
    setLoading(false);
  };

  const imgOpts    = state.images.map(i=>({value:i.id,label:`${i.name} (${i.disk_format})`}));
  const flavorOpts = state.flavors.map(f=>({value:f.id,label:`${f.name} · ${f.vcpus}vCPU · ${Math.round(f.ram/1024)}GB · ${f.disk}GB`}));
  const netOpts    = state.networks.filter(n=>!n["router:external"]).map(n=>({value:n.id,label:n.name}));
  const keyOpts    = state.keypairs.map(k=>({value:k.keypair?.name||k.name,label:k.keypair?.name||k.name}));
  const azOpts     = state.azones.map(z=>({value:z.zoneName,label:z.zoneName}));
  const sgOpts     = state.secgroups.map(s=>({value:s.name,label:s.name}));
  const STEPS      = ["DETAILS","SOURCE","FLAVOR","NETWORK","SECURITY","USER DATA"];

  return (
    <Modal title="LAUNCH INSTANCE" onClose={onClose} wide>
      <div className="wizard-steps">
        {STEPS.map((s,i)=>(
          <div key={s} className={`wizard-step ${step===i+1?"active":""} ${step>i+1?"done":""}`} onClick={()=>setStep(i+1)}>
            <div className="wizard-num">{step>i+1?"✓":i+1}</div>
            <div className="wizard-label">{s}</div>
          </div>
        ))}
      </div>
      <div className="wizard-body">
        {step===1&&<div className="form-grid">
          <Field label="INSTANCE NAME *"><Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="my-server"/></Field>
          <Field label="COUNT"><Input type="number" min={1} max={10} value={form.count} onChange={e=>set("count",e.target.value)}/></Field>
          <Field label="AVAILABILITY ZONE"><Select value={form.az} onChange={e=>set("az",e.target.value)} options={azOpts} placeholder="— default —"/></Field>
        </div>}
        {step===2&&<Field label="BOOT IMAGE *">
          <div className="image-picker">
            {state.images.map(img=>(
              <div key={img.id} className={`img-pick-card ${form.imageRef===img.id?"selected":""}`} onClick={()=>set("imageRef",img.id)}>
                <div className="img-pick-icon">◉</div>
                <div className="img-pick-name">{img.name}</div>
                <div className="img-pick-meta">{img.disk_format?.toUpperCase()} · {img.size?`${Math.round(img.size/1e6)}MB`:"?"}</div>
                <div className="img-pick-status" style={{color:img.status==="active"?"#00ff88":"#888"}}>● {img.status}</div>
              </div>
            ))}
          </div>
        </Field>}
        {step===3&&<Field label="FLAVOR *">
          <div className="flavor-picker">
            {state.flavors.map(f=>(
              <div key={f.id} className={`flavor-card ${form.flavorRef===f.id?"selected":""}`} onClick={()=>set("flavorRef",f.id)}>
                <div className="flavor-name">{f.name}</div>
                <div className="flavor-specs"><span>⚡ {f.vcpus} vCPU</span><span>◈ {Math.round(f.ram/1024)}GB RAM</span><span>◉ {f.disk}GB</span></div>
              </div>
            ))}
          </div>
        </Field>}
        {step===4&&<div className="form-grid">
          <Field label="NETWORK"><Select value={form.network_id} onChange={e=>set("network_id",e.target.value)} options={netOpts} placeholder="— auto —"/></Field>
          <Field label="KEY PAIR"><Select value={form.key_name} onChange={e=>set("key_name",e.target.value)} options={keyOpts} placeholder="— none —"/></Field>
        </div>}
        {step===5&&<Field label="SECURITY GROUP"><Select value={form.security_group} onChange={e=>set("security_group",e.target.value)} options={sgOpts} placeholder="— none —"/></Field>}
        {step===6&&<Field label="USER DATA (cloud-init)">
          <textarea className="ui-input" rows={8} value={form.user_data} onChange={e=>set("user_data",e.target.value)} placeholder={"#!/bin/bash\napt-get update"}/>
        </Field>}
      </div>
      <div className="wizard-footer">
        {step>1&&<Btn onClick={()=>setStep(s=>s-1)}>← BACK</Btn>}
        {step<STEPS.length&&<Btn variant="primary" onClick={()=>setStep(s=>s+1)}>NEXT →</Btn>}
        {step===STEPS.length&&<Btn variant="primary" loading={loading} onClick={launch}>🚀 LAUNCH</Btn>}
      </div>
    </Modal>
  );
}

// ── Main Compute Page ─────────────────────────────────────────────────────────
export default function Compute() {
  const { state, refresh, toast, load } = useStore();
  const [showLaunch,    setShowLaunch]   = useState(false);
  const [sshServer,     setSshServer]    = useState(null);
  const [eventsServer,  setEventsServer] = useState(null);
  const [tagServer,     setTagServer]    = useState(null);
  const [showBulk,      setShowBulk]     = useState(false);
  const [confirm,       setConfirm]      = useState(null);
  const [actLoading,    setActLoading]   = useState({});
  const [search,        setSearch]       = useState("");
  const [statusFilter,  setStatusFilter] = useState("ALL");
  // Click row → open detail page
  const [detailServer,  setDetailServer] = useState(null);

  const act = useCallback(async (id, name, body, label) => {
    setActLoading(a=>({...a,[id]:true}));
    try { await compute.action(id, body); toast(`${label} → ${name}`,"ok"); setTimeout(()=>load("servers",compute.servers),2500); }
    catch(e){ toast(`${label} failed: ${e.message}`,"error"); }
    setActLoading(a=>({...a,[id]:false}));
  },[toast,load]);

  const del = useCallback((s)=>{
    setConfirm({ title:"DELETE INSTANCE", message:`Permanently delete "${s.name}"?`, danger:true,
      onConfirm:async()=>{ try{await compute.delete(s.id);toast(`${s.name} deleted`,"ok");setTimeout(()=>load("servers",compute.servers),2000);}catch(e){toast(e.message,"error");} }
    });
  },[toast,load]);

  // If a detail server is open, render detail page
  if (detailServer) {
    return <InstanceDetail server={detailServer} onBack={() => { setDetailServer(null); load("servers", compute.servers); }} />;
  }

  const statuses = ["ALL",...new Set(state.servers.map(s=>s.status))];
  const filtered = state.servers.filter(s=>{
    const ms=s.name.toLowerCase().includes(search.toLowerCase())||s.id.includes(search);
    const mf=statusFilter==="ALL"||s.status===statusFilter;
    return ms&&mf;
  });

  const cols = [
    { key:"dot",     label:"",         w:"30px",  render:(_,r)=><StatusDot status={r.status}/> },
    { key:"name",    label:"NAME/ID",  w:"1fr",
      render:(v,r)=>(
        <div style={{cursor:'pointer'}} onClick={()=>setDetailServer(r)}>
          <div className="cell-primary" style={{color:'var(--accent)',textDecoration:'none'}}>{v}</div>
          <div className="cell-mono" style={{fontSize:10}}>{r.id?.slice(0,24)}…</div>
        </div>
      )
    },
    { key:"ip",      label:"IP",       w:"150px", render:(_,r)=>{
      const ips=Object.values(r.addresses||{}).flat().map(a=>a.addr);
      return <div className="cell-mono">{ips[0]||"—"}{ips.length>1&&<span style={{color:"var(--text-dim)"}}> +{ips.length-1}</span>}</div>;
    }},
    { key:"status",  label:"STATE",    w:"110px", render:(_,r)=><span style={{color:statusColor(r.status),fontWeight:700,fontSize:11,letterSpacing:1}}>{r.status}</span> },
    { key:"flavor",  label:"FLAVOR",   w:"130px", render:(_,r)=><span className="cell-dim">{r.flavor?.original_name||r.flavor?.id||"—"}</span> },
    { key:"az",      label:"ZONE",     w:"90px",  render:(_,r)=><span className="cell-dim">{r["OS-EXT-AZ:availability_zone"]||"—"}</span> },
    { key:"actions", label:"ACTIONS",  w:"220px", render:(_,r)=>{
      if (actLoading[r.id]) return <Spinner sm/>;
      const s=r.status;
      return (
        <div className="action-row">
          {s==="ACTIVE"    &&<IconBtn icon="⏹" color="#ffaa00" title="Stop"        onClick={e=>{e.stopPropagation();act(r.id,r.name,{"os-stop":null},"Stop")}}/>}
          {s==="SHUTOFF"   &&<IconBtn icon="▶"  color="#00ff88" title="Start"       onClick={e=>{e.stopPropagation();act(r.id,r.name,{"os-start":null},"Start")}}/>}
          {s==="ACTIVE"    &&<IconBtn icon="↺"  color="#00aaff" title="Soft Reboot" onClick={e=>{e.stopPropagation();act(r.id,r.name,{reboot:{type:"SOFT"}},"Reboot")}}/>}
          {s==="ACTIVE"    &&<IconBtn icon="⎗"  color="#00ffcc" title="SSH Terminal" onClick={e=>{e.stopPropagation();setSshServer(r)}}/>}
          <IconBtn icon="⬡" color="#00aaff" title="Open Detail Page" onClick={()=>setDetailServer(r)}/>
          <IconBtn icon="✕" color="#ff4466" title="Delete" onClick={e=>{e.stopPropagation();del(r)}}/>
        </div>
      );
    }},
  ];

  return (
    <div className="page">
      {showLaunch   && <LaunchModal onClose={()=>setShowLaunch(false)} onDone={()=>{setShowLaunch(false);setTimeout(()=>load("servers",compute.servers),3000);}}/>}
      {eventsServer && <InstanceEvents server={eventsServer} onClose={()=>setEventsServer(null)}/>}
      {tagServer    && <TagManager server={tagServer} onClose={()=>setTagServer(null)}/>}
      {showBulk     && <BulkActions servers={state.servers} onDone={()=>setShowBulk(false)} onClose={()=>setShowBulk(false)}/>}
      {confirm      && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)}/>}
      {sshServer    && <SSHTerminal server={sshServer} onClose={()=>setSshServer(null)}/>}

      <SectionHeader title="INSTANCES" actions={
        <>
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{width:200,padding:"6px 10px"}}/>
          <select className="ui-input sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:130}}>
            {statuses.map(s=><option key={s}>{s}</option>)}
          </select>
          <Btn onClick={()=>load("servers",compute.servers)}>↻ REFRESH</Btn>
          <Btn onClick={()=>setShowBulk(true)}>☰ BULK</Btn>
          <Btn variant="primary" onClick={()=>setShowLaunch(true)}>⚡ LAUNCH</Btn>
        </>
      }/>

      {state.servers.length>0&&(
        <div style={{display:"flex",gap:12,padding:"8px 12px",background:"var(--surface2)",border:"1px solid var(--border)",fontSize:10,flexWrap:"wrap",marginBottom:8}}>
          {Object.entries(state.servers.reduce((a,s)=>({...a,[s.status]:(a[s.status]||0)+1}),{})).map(([st,cnt])=>(
            <span key={st} style={{color:statusColor(st),fontWeight:700,cursor:'pointer'}} onClick={()=>setStatusFilter(st)}>{cnt} {st}</span>
          ))}
          <span style={{color:"var(--text-dim)",marginLeft:"auto"}}>Showing {filtered.length}/{state.servers.length} · Click a row to open detail</span>
        </div>
      )}

      <Table cols={cols} rows={filtered} empty="No instances. Click LAUNCH to create one." loading={state.loading?.servers}
        onRowClick={row=>setDetailServer(row)}
      />
    </div>
  );
}