// src/pages/Magnum.jsx — Kubernetes Cluster management (OpenStack Magnum)
import { useState, useEffect } from "react";
import { useStore } from "../hooks/useStore";
import { GET, POST, DEL } from "../api/client.js";
import { Table, Btn, Modal, Field, Input, Select, Toggle, Badge, IconBtn, ConfirmModal, SectionHeader, StatCard, Mono } from "../components/UI.jsx";

const statusColor = s => ({
  CREATE_COMPLETE:"#00ff88", CREATE_IN_PROGRESS:"#ffaa00", CREATE_FAILED:"#ff4466",
  DELETE_IN_PROGRESS:"#ff8800", UPDATE_IN_PROGRESS:"#00aaff", UPDATE_COMPLETE:"#00ff88",
  RUNNING:"#00ff88", ERROR:"#ff4466",
})[s] || "#888";

// ── Create Cluster Modal ──────────────────────────────────────────────────────
function CreateClusterModal({ templates, onClose, onDone, toast }) {
  const [form, setForm] = useState({
    name:"", cluster_template_id:"",
    node_count: 3, master_count: 1,
    keypair:"", master_flavor_id:"", flavor_id:"",
    docker_volume_size: 50,
  });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const { state } = useStore();

  const create = async () => {
    if (!form.name || !form.cluster_template_id) { toast("Name and template required","error"); return; }
    setLoading(true);
    try {
      await POST("/magnum/clusters", {
        ...form,
        node_count: parseInt(form.node_count),
        master_count: parseInt(form.master_count),
        docker_volume_size: parseInt(form.docker_volume_size),
      });
      toast(`Cluster "${form.name}" creation started!`,"ok");
      onDone();
    } catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  const tmplOpts   = templates.map(t=>({value:t.uuid||t.id, label:`${t.name} (${t.coe})`}));
  const keypairOpts= state.keypairs.map(k=>({value:k.keypair?.name||k.name, label:k.keypair?.name||k.name}));
  const flavorOpts = state.flavors.map(f=>({value:f.id, label:`${f.name} · ${f.vcpus}vCPU · ${Math.round(f.ram/1024)}GB`}));

  return (
    <Modal title="CREATE KUBERNETES CLUSTER" onClose={onClose} wide>
      <div className="form-grid">
        <Field label="CLUSTER NAME *"><Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="my-k8s-cluster" /></Field>
        <Field label="CLUSTER TEMPLATE *"><Select value={form.cluster_template_id} onChange={e=>set("cluster_template_id",e.target.value)} options={tmplOpts} placeholder="— select template —" /></Field>
        <Field label="WORKER NODES"><Input type="number" min={1} max={50} value={form.node_count} onChange={e=>set("node_count",e.target.value)} /></Field>
        <Field label="MASTER NODES"><Input type="number" min={1} max={5} value={form.master_count} onChange={e=>set("master_count",e.target.value)} /></Field>
        <Field label="KEY PAIR"><Select value={form.keypair} onChange={e=>set("keypair",e.target.value)} options={keypairOpts} placeholder="— none —" /></Field>
        <Field label="DOCKER VOLUME SIZE (GB)"><Input type="number" min={10} value={form.docker_volume_size} onChange={e=>set("docker_volume_size",e.target.value)} /></Field>
        <Field label="MASTER FLAVOR"><Select value={form.master_flavor_id} onChange={e=>set("master_flavor_id",e.target.value)} options={flavorOpts} placeholder="— template default —" /></Field>
        <Field label="WORKER FLAVOR"><Select value={form.flavor_id} onChange={e=>set("flavor_id",e.target.value)} options={flavorOpts} placeholder="— template default —" /></Field>
      </div>
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={create}>⎈ CREATE CLUSTER</Btn>
      </div>
    </Modal>
  );
}

// ── Create Template Modal ─────────────────────────────────────────────────────
function CreateTemplateModal({ onClose, onDone, toast }) {
  const { state } = useStore();
  const [form, setForm] = useState({
    name:"", coe:"kubernetes", image_id:"", keypair_id:"",
    flavor_id:"", master_flavor_id:"", network_driver:"flannel",
    dns_nameserver:"8.8.8.8", docker_storage_driver:"overlay2",
    external_network_id:"", fixed_network:"", fixed_subnet:"",
    master_lb_enabled: true, floating_ip_enabled: true,
    volume_driver:"cinder",
  });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const extNets    = state.networks.filter(n=>n["router:external"]);
  const intNets    = state.networks.filter(n=>!n["router:external"]);
  const imageOpts  = state.images.map(i=>({value:i.id, label:i.name}));
  const keypairOpts= state.keypairs.map(k=>({value:k.keypair?.name||k.name, label:k.keypair?.name||k.name}));
  const flavorOpts = state.flavors.map(f=>({value:f.id, label:`${f.name}`}));

  const create = async () => {
    if (!form.name || !form.image_id) { toast("Name and image required","error"); return; }
    setLoading(true);
    try {
      await POST("/magnum/clustertemplates", form);
      toast(`Template "${form.name}" created!`,"ok");
      onDone();
    } catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  return (
    <Modal title="CREATE CLUSTER TEMPLATE" onClose={onClose} wide>
      <div className="form-grid">
        <Field label="TEMPLATE NAME *"><Input value={form.name} onChange={e=>set("name",e.target.value)} /></Field>
        <Field label="COE"><Select value={form.coe} onChange={e=>set("coe",e.target.value)} options={[{value:"kubernetes",label:"Kubernetes"},{value:"swarm",label:"Docker Swarm"},{value:"mesos",label:"Mesos"}]} /></Field>
        <Field label="IMAGE *"><Select value={form.image_id} onChange={e=>set("image_id",e.target.value)} options={imageOpts} placeholder="— select image —" /></Field>
        <Field label="KEY PAIR"><Select value={form.keypair_id} onChange={e=>set("keypair_id",e.target.value)} options={keypairOpts} placeholder="— none —" /></Field>
        <Field label="WORKER FLAVOR"><Select value={form.flavor_id} onChange={e=>set("flavor_id",e.target.value)} options={flavorOpts} placeholder="— default —" /></Field>
        <Field label="MASTER FLAVOR"><Select value={form.master_flavor_id} onChange={e=>set("master_flavor_id",e.target.value)} options={flavorOpts} placeholder="— default —" /></Field>
        <Field label="NETWORK DRIVER"><Select value={form.network_driver} onChange={e=>set("network_driver",e.target.value)} options={[{value:"flannel",label:"Flannel"},{value:"calico",label:"Calico"},{value:"cilium",label:"Cilium"}]} /></Field>
        <Field label="VOLUME DRIVER"><Select value={form.volume_driver} onChange={e=>set("volume_driver",e.target.value)} options={[{value:"cinder",label:"Cinder"},{value:"rexray",label:"Rexray"}]} /></Field>
        <Field label="EXTERNAL NETWORK"><Select value={form.external_network_id} onChange={e=>set("external_network_id",e.target.value)} options={extNets.map(n=>({value:n.id,label:n.name}))} placeholder="— none —" /></Field>
        <Field label="FIXED NETWORK"><Select value={form.fixed_network} onChange={e=>set("fixed_network",e.target.value)} options={intNets.map(n=>({value:n.id,label:n.name}))} placeholder="— none —" /></Field>
        <Field label="DNS NAMESERVER"><Input value={form.dns_nameserver} onChange={e=>set("dns_nameserver",e.target.value)} /></Field>
        <Field label="DOCKER STORAGE"><Select value={form.docker_storage_driver} onChange={e=>set("docker_storage_driver",e.target.value)} options={[{value:"overlay2",label:"overlay2"},{value:"devicemapper",label:"devicemapper"}]} /></Field>
      </div>
      <div className="toggle-row" style={{marginTop:8}}>
        <Toggle label="MASTER LB ENABLED"    checked={form.master_lb_enabled}     onChange={v=>set("master_lb_enabled",v)} />
        <Toggle label="FLOATING IP ENABLED"  checked={form.floating_ip_enabled}   onChange={v=>set("floating_ip_enabled",v)} />
      </div>
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={create}>CREATE TEMPLATE</Btn>
      </div>
    </Modal>
  );
}

// ── Cluster Detail Modal ──────────────────────────────────────────────────────
function ClusterDetail({ cluster, onClose }) {
  const [detail, setDetail] = useState(null);
  useEffect(()=>{
    GET(`/magnum/clusters/${cluster.uuid||cluster.id}`).then(setDetail).catch(()=>{});
  },[cluster]);
  const d = detail || cluster;
  return (
    <Modal title={`CLUSTER — ${d.name}`} onClose={onClose} wide>
      <div className="detail-grid">
        <div className="detail-section">
          <div className="detail-head">IDENTITY</div>
          <div className="detail-rows">
            <div className="detail-row"><span>NAME</span><span>{d.name}</span></div>
            <div className="detail-row"><span>UUID</span><Mono>{d.uuid||d.id}</Mono></div>
            <div className="detail-row"><span>STATUS</span><span style={{color:statusColor(d.status)}}>{d.status}</span></div>
            <div className="detail-row"><span>COE</span><Badge label={d.coe||"kubernetes"} color="#00aaff" /></div>
          </div>
        </div>
        <div className="detail-section">
          <div className="detail-head">NODES</div>
          <div className="detail-rows">
            <div className="detail-row"><span>MASTER COUNT</span><span>{d.master_count}</span></div>
            <div className="detail-row"><span>NODE COUNT</span><span>{d.node_count}</span></div>
            <div className="detail-row"><span>MASTER ADDRESSES</span><span>{(d.master_addresses||[]).join(", ")||"—"}</span></div>
            <div className="detail-row"><span>NODE ADDRESSES</span><span>{(d.node_addresses||[]).join(", ")||"—"}</span></div>
          </div>
        </div>
        <div className="detail-section">
          <div className="detail-head">CONFIG</div>
          <div className="detail-rows">
            <div className="detail-row"><span>TEMPLATE</span><Mono>{d.cluster_template_id?.slice(0,18)}</Mono></div>
            <div className="detail-row"><span>KEYPAIR</span><span>{d.keypair||"—"}</span></div>
            <div className="detail-row"><span>API ADDRESS</span><Mono>{d.api_address||"—"}</Mono></div>
            <div className="detail-row"><span>DOCKER VOLUME</span><span>{d.docker_volume_size} GB</span></div>
          </div>
        </div>
        <div className="detail-section">
          <div className="detail-head">TIMESTAMPS</div>
          <div className="detail-rows">
            <div className="detail-row"><span>CREATED</span><span>{d.created_at?new Date(d.created_at).toLocaleString():"—"}</span></div>
            <div className="detail-row"><span>UPDATED</span><span>{d.updated_at?new Date(d.updated_at).toLocaleString():"—"}</span></div>
          </div>
        </div>
      </div>
      {d.status_reason && (
        <div style={{marginTop:14,padding:12,background:"var(--surface2)",border:"1px solid var(--border)",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--warn)"}}>
          {d.status_reason}
        </div>
      )}
    </Modal>
  );
}

// ── Main Magnum Page ──────────────────────────────────────────────────────────
export default function Magnum() {
  const { toast } = useStore();
  const [clusters,   setClusters]   = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [tab,        setTab]        = useState("clusters");
  const [loading,    setLoading]    = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateTmpl, setShowCreateTmpl] = useState(false);
  const [detailCluster, setDetailCluster] = useState(null);
  const [confirm,    setConfirm]    = useState(null);

  const load = async () => {
    setLoading(true);
    await Promise.all([
      GET("/magnum/clusters").then(setClusters).catch(()=>setClusters([])),
      GET("/magnum/clustertemplates").then(setTemplates).catch(()=>setTemplates([])),
    ]);
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const delCluster = (c) => setConfirm({
    title:"DELETE CLUSTER", message:`Delete cluster "${c.name}"? This will destroy all nodes.`, danger:true,
    onConfirm: async()=>{ try { await DEL(`/magnum/clusters/${c.uuid||c.id}`); toast(`${c.name} deletion started`,"ok"); setTimeout(load,2000); } catch(e){ toast(e.message,"error"); } }
  });
  const delTemplate = (t) => setConfirm({
    title:"DELETE TEMPLATE", message:`Delete template "${t.name}"?`, danger:true,
    onConfirm: async()=>{ try { await DEL(`/magnum/clustertemplates/${t.uuid||t.id}`); toast("Template deleted","ok"); load(); } catch(e){ toast(e.message,"error"); } }
  });

  const clusterCols = [
    { key:"name",   label:"NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v}</div><div className="cell-mono">{(r.uuid||r.id)?.slice(0,24)}…</div></div> },
    { key:"status", label:"STATUS", w:"180px", render:v=><span style={{color:statusColor(v),fontWeight:700,fontSize:11}}>{v}</span> },
    { key:"coe",    label:"COE", w:"110px", render:v=><Badge label={v?.toUpperCase()||"K8S"} color="#00aaff" /> },
    { key:"master_count", label:"MASTERS", w:"80px", render:v=><span>{v}</span> },
    { key:"node_count",   label:"WORKERS", w:"80px", render:v=><span>{v}</span> },
    { key:"keypair", label:"KEYPAIR", w:"110px", render:v=><span className="cell-dim">{v||"—"}</span> },
    { key:"actions", label:"ACTIONS", w:"90px", render:(_,r)=>(
      <div className="action-row">
        <IconBtn icon="≡" color="#888" title="Details"       onClick={()=>setDetailCluster(r)} />
        <IconBtn icon="✕" color="#ff4466" title="Delete"     onClick={()=>delCluster(r)} />
      </div>
    )},
  ];

  const templateCols = [
    { key:"name",           label:"TEMPLATE NAME", w:"1fr" },
    { key:"coe",            label:"COE", w:"120px", render:v=><Badge label={v?.toUpperCase()} color="#aa44ff" /> },
    { key:"network_driver", label:"NETWORK", w:"100px", render:v=><span className="cell-dim">{v||"—"}</span> },
    { key:"docker_storage_driver", label:"STORAGE", w:"110px", render:v=><span className="cell-dim">{v||"—"}</span> },
    { key:"master_lb_enabled", label:"MASTER LB", w:"90px", render:v=><span style={{color:v?"#00ff88":"#888"}}>{v?"YES":"NO"}</span> },
    { key:"floating_ip_enabled", label:"FLOAT IP", w:"90px", render:v=><span style={{color:v?"#00ff88":"#888"}}>{v?"YES":"NO"}</span> },
    { key:"actions", label:"ACTIONS", w:"70px", render:(_,r)=><IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>delTemplate(r)} /> },
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {showCreate     && <CreateClusterModal  templates={templates} onClose={()=>setShowCreate(false)}     onDone={()=>{setShowCreate(false);setTimeout(load,1500);}} toast={toast} />}
      {showCreateTmpl && <CreateTemplateModal onClose={()=>setShowCreateTmpl(false)} onDone={()=>{setShowCreateTmpl(false);load();}} toast={toast} />}
      {detailCluster  && <ClusterDetail cluster={detailCluster} onClose={()=>setDetailCluster(null)} />}

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:8}}>
        <StatCard label="CLUSTERS"  value={clusters.length}  color="#00ffcc" icon="⎈" sub={`${clusters.filter(c=>c.status==="CREATE_COMPLETE").length} healthy`} />
        <StatCard label="TEMPLATES" value={templates.length} color="#aa44ff" icon="▣" />
        <StatCard label="TOTAL WORKERS" value={clusters.reduce((a,c)=>a+(c.node_count||0),0)} color="#00aaff" icon="⚡" />
        <StatCard label="TOTAL MASTERS" value={clusters.reduce((a,c)=>a+(c.master_count||0),0)} color="#ff8800" icon="◎" />
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab==="clusters"?"active":""}`} onClick={()=>setTab("clusters")}>⎈ CLUSTERS <span className="tab-count">{clusters.length}</span></button>
        <button className={`tab-btn ${tab==="templates"?"active":""}`} onClick={()=>setTab("templates")}>▣ TEMPLATES <span className="tab-count">{templates.length}</span></button>
      </div>

      {tab === "clusters" && (
        <>
          <SectionHeader title="KUBERNETES CLUSTERS" actions={
            <>
              <Btn onClick={load}>↻ REFRESH</Btn>
              <Btn variant="primary" onClick={()=>setShowCreate(true)}>⎈ CREATE CLUSTER</Btn>
            </>
          } />
          <Table cols={clusterCols} rows={clusters} empty="No clusters found. Magnum may not be installed." loading={loading} />
        </>
      )}

      {tab === "templates" && (
        <>
          <SectionHeader title="CLUSTER TEMPLATES" actions={
            <>
              <Btn onClick={load}>↻ REFRESH</Btn>
              <Btn variant="primary" onClick={()=>setShowCreateTmpl(true)}>+ CREATE TEMPLATE</Btn>
            </>
          } />
          <Table cols={templateCols} rows={templates} empty="No cluster templates found." loading={loading} />
        </>
      )}
    </div>
  );
}
