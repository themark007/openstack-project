// src/pages/Heat.jsx — OpenStack Heat Orchestration
import { useState, useEffect } from "react";
import { useStore } from "../hooks/useStore.jsx";
import { GET, POST, DEL } from "../api/client.js";
import { Table, Btn, Modal, Field, Input, IconBtn, ConfirmModal, SectionHeader, StatCard, Badge, Mono } from "../components/UI.jsx";

const SAMPLE_TEMPLATE = `heat_template_version: 2017-02-24

description: Simple server stack

parameters:
  image:
    type: string
    label: Image
    default: cirros
  flavor:
    type: string
    label: Flavor
    default: m1.tiny
  network:
    type: string
    label: Network
    default: private

resources:
  my_instance:
    type: OS::Nova::Server
    properties:
      image: { get_param: image }
      flavor: { get_param: flavor }
      networks:
        - network: { get_param: network }

outputs:
  instance_id:
    description: ID of the created server
    value: { get_attr: [my_instance, id] }
`;

const stackStatusColor = s => ({
  CREATE_COMPLETE:"#00ff88",  CREATE_IN_PROGRESS:"#ffaa00", CREATE_FAILED:"#ff4466",
  UPDATE_COMPLETE:"#00ff88",  UPDATE_IN_PROGRESS:"#00aaff", UPDATE_FAILED:"#ff4466",
  DELETE_IN_PROGRESS:"#ff8800",DELETE_FAILED:"#ff4466",     ROLLBACK_COMPLETE:"#ff8800",
  ROLLBACK_IN_PROGRESS:"#ffaa00",
})[s] || "#888";

// ── Create Stack Modal ────────────────────────────────────────────────────────
function CreateStackModal({ onClose, onDone, toast }) {
  const [form, setForm] = useState({ stack_name:"", template_body: SAMPLE_TEMPLATE, timeout_mins: 60 });
  const [params, setParams] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  // Parse parameters from YAML template (simple regex)
  const parseParams = (tmpl) => {
    const paramSection = tmpl.match(/^parameters:\n([\s\S]*?)(?=\n\S|\n$)/m);
    if (!paramSection) return {};
    const pairs = {};
    const matches = [...paramSection[1].matchAll(/^\s{2}(\w+):\n[\s\S]*?default:\s*(.+)$/mg)];
    matches.forEach(m => { pairs[m[1]] = m[2].trim(); });
    return pairs;
  };

  const [detectedParams, setDetectedParams] = useState({});
  useEffect(() => {
    try { const p = parseParams(form.template_body); setDetectedParams(p); setParams(p); } catch(_){}
  }, [form.template_body]);

  const create = async () => {
    if (!form.stack_name) { toast("Stack name required","error"); return; }
    setLoading(true);
    try {
      const body = {
        stack_name: form.stack_name,
        template: form.template_body,
        timeout_mins: parseInt(form.timeout_mins) || 60,
        ...(Object.keys(params).length > 0 && { parameters: params }),
      };
      await POST("/heat/stacks", body);
      toast(`Stack "${form.stack_name}" creation started!`,"ok");
      onDone();
    } catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  return (
    <Modal title="CREATE STACK" onClose={onClose} full>
      <div style={{display:"grid", gridTemplateColumns:"1fr 300px", gap:16, flex:1}}>
        {/* Template editor */}
        <div>
          <Field label="HOT TEMPLATE (YAML)">
            <textarea className="ui-input" rows={22} value={form.template_body}
              onChange={e=>set("template_body",e.target.value)}
              style={{fontFamily:"var(--font-mono)",fontSize:12,resize:"vertical"}} />
          </Field>
        </div>

        {/* Right panel */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Field label="STACK NAME *">
            <Input value={form.stack_name} onChange={e=>set("stack_name",e.target.value)} placeholder="my-stack" />
          </Field>
          <Field label="TIMEOUT (MINUTES)">
            <Input type="number" value={form.timeout_mins} onChange={e=>set("timeout_mins",e.target.value)} />
          </Field>

          {Object.keys(detectedParams).length > 0 && (
            <div>
              <div style={{fontSize:9,letterSpacing:2,color:"var(--text-dim)",marginBottom:8,fontWeight:700}}>PARAMETERS</div>
              {Object.entries(detectedParams).map(([k,defaultVal])=>(
                <Field key={k} label={k.toUpperCase()}>
                  <Input value={params[k]||defaultVal} onChange={e=>setParams(p=>({...p,[k]:e.target.value}))} />
                </Field>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={create}>◈ LAUNCH STACK</Btn>
      </div>
    </Modal>
  );
}

// ── Stack Resources/Events Modal ──────────────────────────────────────────────
function StackDetailModal({ stack, onClose }) {
  const [resources, setResources] = useState([]);
  const [events,    setEvents]    = useState([]);
  const [tab, setTab] = useState("resources");
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const name = stack.stack_name || stack.stack_name;
    const id   = stack.id || stack.stack_name;
    Promise.all([
      GET(`/heat/stacks/${name}/${id}/resources`).then(setResources).catch(()=>{}),
      GET(`/heat/stacks/${name}/${id}/events`).then(setEvents).catch(()=>{}),
    ]).finally(()=>setLoading(false));
  },[stack]);

  const resColor = s=>({CREATE_COMPLETE:"#00ff88",CREATE_IN_PROGRESS:"#ffaa00",CREATE_FAILED:"#ff4466",DELETE_IN_PROGRESS:"#ff8800"})[s]||"#888";

  return (
    <Modal title={`STACK — ${stack.stack_name}`} onClose={onClose} wide>
      <div style={{marginBottom:10}}>
        <span style={{color:stackStatusColor(stack.stack_status),fontWeight:700,fontSize:12}}>{stack.stack_status}</span>
        {stack.stack_status_reason && <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:12}}>{stack.stack_status_reason}</span>}
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab==="resources"?"active":""}`} onClick={()=>setTab("resources")}>RESOURCES <span className="tab-count">{resources.length}</span></button>
        <button className={`tab-btn ${tab==="events"?"active":""}`}    onClick={()=>setTab("events")}>EVENTS <span className="tab-count">{events.length}</span></button>
      </div>

      {tab === "resources" && (
        <Table
          loading={loading}
          cols={[
            { key:"resource_name",   label:"RESOURCE NAME", w:"1fr" },
            { key:"resource_type",   label:"TYPE", w:"240px", render:v=><span className="cell-mono" style={{fontSize:10}}>{v}</span> },
            { key:"resource_status", label:"STATUS", w:"180px", render:v=><span style={{color:resColor(v),fontWeight:700,fontSize:11}}>{v}</span> },
            { key:"physical_resource_id", label:"PHYSICAL ID", w:"220px", render:v=><Mono>{v?.slice(0,22)||"—"}</Mono> },
          ]}
          rows={resources}
          empty="No resources"
        />
      )}

      {tab === "events" && (
        <div style={{maxHeight:360,overflowY:"auto"}}>
          {loading && <div className="empty-state"><span className="spinner"/></div>}
          {events.slice().reverse().map((e,i)=>(
            <div key={i} style={{padding:"8px 12px",borderBottom:"1px solid var(--border)",display:"grid",gridTemplateColumns:"140px 1fr 200px",gap:8,alignItems:"center",fontSize:11}}>
              <span className="cell-mono" style={{fontSize:10,color:"var(--text-dim)"}}>{new Date(e.event_time||e.time).toLocaleString()}</span>
              <span style={{color:resColor(e.resource_status)}}>{e.resource_name} → {e.resource_status}</span>
              <span className="cell-dim">{e.resource_status_reason?.slice(0,60)||"—"}</span>
            </div>
          ))}
          {!loading && events.length===0 && <div className="empty-state"><div>No events</div></div>}
        </div>
      )}
    </Modal>
  );
}

// ── Main Heat Page ────────────────────────────────────────────────────────────
export default function Heat() {
  const { toast } = useStore();
  const { state } = useStore();
  const [stacks,     setStacks]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detailStack,setDetailStack]= useState(null);
  const [confirm,    setConfirm]    = useState(null);

  const load = async () => {
    setLoading(true);
    await GET(`/heat/stacks?project_id=${state.auth?.project?.id||""}`).then(setStacks).catch(()=>setStacks([]));
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const del = (s) => setConfirm({
    title:"DELETE STACK", message:`Delete stack "${s.stack_name}"? All created resources will be destroyed.`, danger:true,
    onConfirm: async()=>{
      try {
        const id = s.id || s.stack_name;
        await DEL(`/heat/stacks/${s.stack_name}/${id}`);
        toast(`${s.stack_name} deletion started`,"ok");
        setTimeout(load,2000);
      } catch(e){ toast(e.message,"error"); }
    }
  });

  const cols = [
    { key:"stack_name", label:"STACK NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v}</div><div className="cell-mono">{r.id?.slice(0,24)||"—"}</div></div> },
    { key:"stack_status", label:"STATUS", w:"200px", render:v=><span style={{color:stackStatusColor(v),fontWeight:700,fontSize:11}}>{v}</span> },
    { key:"creation_time", label:"CREATED", w:"130px", render:v=><span className="cell-dim">{v?new Date(v).toLocaleDateString():"—"}</span> },
    { key:"updated_time",  label:"UPDATED", w:"130px", render:v=><span className="cell-dim">{v?new Date(v).toLocaleDateString():"—"}</span> },
    { key:"actions", label:"ACTIONS", w:"90px", render:(_,r)=>(
      <div className="action-row">
        <IconBtn icon="≡" color="#888"    title="Details" onClick={()=>setDetailStack(r)} />
        <IconBtn icon="✕" color="#ff4466" title="Delete"  onClick={()=>del(r)} />
      </div>
    )},
  ];

  const complete = stacks.filter(s=>s.stack_status==="CREATE_COMPLETE").length;
  const failed   = stacks.filter(s=>s.stack_status?.includes("FAILED")).length;

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {showCreate  && <CreateStackModal  onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false);setTimeout(load,1500);}} toast={toast} />}
      {detailStack && <StackDetailModal  stack={detailStack} onClose={()=>setDetailStack(null)} />}

      <div className="stats-grid" style={{marginBottom:8}}>
        <StatCard label="TOTAL STACKS"    value={stacks.length} color="#00ffcc" icon="◈" />
        <StatCard label="COMPLETE"        value={complete}      color="#00ff88" icon="✓" />
        <StatCard label="FAILED"          value={failed}        color="#ff4466" icon="✕" />
        <StatCard label="IN PROGRESS"     value={stacks.filter(s=>s.stack_status?.includes("IN_PROGRESS")).length} color="#ffaa00" icon="↻" />
      </div>

      <SectionHeader title="HEAT STACKS" actions={
        <>
          <Btn onClick={load}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowCreate(true)}>◈ CREATE STACK</Btn>
        </>
      } />
      <Table cols={cols} rows={stacks} empty="No Heat stacks found." loading={loading} />
    </div>
  );
}
