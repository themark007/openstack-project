// src/pages/FloatingIPs.jsx
import { useState } from "react";
import { useStore } from "../hooks/useStore";
import { network } from "../api/openstack.js";
import { Table, Btn, Modal, Field, Select, IconBtn, ConfirmModal, SectionHeader, Badge, Mono } from "../components/UI.jsx";

export function FloatingIPs() {
  const { state, load, toast } = useStore();
  const [showAlloc, setShowAlloc] = useState(false);
  const [assocFip, setAssocFip] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const extNets = state.networks.filter(n=>n["router:external"]);

  const allocate = async (netId) => {
    try { await network.allocateFip({ floating_network_id: netId }); toast("Floating IP allocated!","ok"); load("floatingips",network.floatingips); }
    catch(e){ toast(e.message,"error"); }
  };

  const associate = async (fip, portId) => {
    try { await network.associateFip(fip.id, { port_id: portId||null }); toast(portId?"IP associated!":"IP disassociated!","ok"); load("floatingips",network.floatingips); }
    catch(e){ toast(e.message,"error"); }
  };

  const release = (fip) => setConfirm({
    title:"RELEASE FLOATING IP", message:`Release ${fip.floating_ip_address}?`, danger:true,
    onConfirm: async()=>{
      try { await network.deallocateFip(fip.id); toast("IP released","ok"); load("floatingips",network.floatingips); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const cols = [
    { key:"floating_ip_address", label:"FLOATING IP", w:"160px", render:v=><Mono>{v}</Mono> },
    { key:"fixed_ip_address",    label:"FIXED IP",    w:"140px", render:v=><Mono>{v||"—"}</Mono> },
    { key:"status",  label:"STATUS",  w:"90px",  render:v=><span style={{color:v==="ACTIVE"?"#00ff88":"#888",fontWeight:700}}>{v}</span> },
    { key:"fnet",    label:"EXT NETWORK", w:"150px", render:(_,r)=>{ const n=state.networks.find(x=>x.id===r.floating_network_id); return n?.name||r.floating_network_id?.slice(0,14)||"—"; }},
    { key:"actions", label:"ACTIONS", w:"130px", render:(_,r)=>(
      <div className="action-row">
        {r.fixed_ip_address
          ? <Btn sm onClick={()=>associate(r,null)}>DISASSOCIATE</Btn>
          : <Btn sm variant="primary" onClick={()=>setAssocFip(r)}>ASSOCIATE</Btn>}
        <IconBtn icon="✕" color="#ff4466" title="Release" onClick={()=>release(r)} />
      </div>
    )},
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {assocFip && (
        <Modal title="ASSOCIATE FLOATING IP" onClose={()=>setAssocFip(null)}>
          <Field label="INSTANCE PORT">
            <Select options={state.servers.map(s=>({
              value: Object.values(s.addresses||{}).flat()[0]?.["OS-EXT-IPS-MAC:mac_addr"]||s.id,
              label: s.name
            }))} placeholder="— select instance —" onChange={e=>{}} />
          </Field>
          <div className="modal-footer"><Btn onClick={()=>setAssocFip(null)}>CANCEL</Btn></div>
        </Modal>
      )}
      {showAlloc && (
        <Modal title="ALLOCATE FLOATING IP" onClose={()=>setShowAlloc(false)}>
          <Field label="EXTERNAL NETWORK">
            {extNets.map(n=><Btn key={n.id} variant="primary" full onClick={()=>{allocate(n.id);setShowAlloc(false);}}>{n.name}</Btn>)}
            {extNets.length===0 && <div style={{color:"var(--text-dim)",fontSize:12}}>No external networks found</div>}
          </Field>
        </Modal>
      )}
      <SectionHeader title="FLOATING IPs" actions={
        <>
          <Btn onClick={()=>load("floatingips",network.floatingips)}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowAlloc(true)}>+ ALLOCATE IP</Btn>
        </>
      } />
      <Table cols={cols} rows={state.floatingips} empty="No floating IPs allocated." loading={state.loading.floatingips} />
    </div>
  );
}

// ── Volumes Page ──────────────────────────────────────────────────────────────
import { volume as volumeApi } from "../api/openstack.js";

export function Volumes() {
  const { state, load, toast } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name:"", size:10, volume_type:"", description:"", source_image:""});
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const create = async () => {
    setLoading(true);
    try {
      await volumeApi.create({ name:form.name, size:parseInt(form.size), volume_type:form.volume_type||undefined, description:form.description||undefined, ...(form.source_image&&{imageRef:form.source_image}) });
      toast("Volume created!","ok"); setShowCreate(false);
      load("volumes",volumeApi.list);
    } catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  const del = (v) => setConfirm({
    title:"DELETE VOLUME", message:`Delete volume "${v.name||v.id}"?`, danger:true,
    onConfirm: async()=>{
      try { await volumeApi.delete(v.id); toast("Volume deleted","ok"); load("volumes",volumeApi.list); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const volStatusColor = s=>({available:"#00ff88",in_use:"#00aaff",error:"#ff4466",creating:"#ffaa00"})[s]||"#888";

  const cols = [
    { key:"name",   label:"NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v||"Unnamed"}</div><div className="cell-mono">{r.id?.slice(0,24)}…</div></div> },
    { key:"status", label:"STATUS", w:"110px", render:v=><span style={{color:volStatusColor(v),fontWeight:700,fontSize:11}}>{v}</span> },
    { key:"size",   label:"SIZE", w:"80px", render:v=><span>{v} GB</span> },
    { key:"volume_type", label:"TYPE", w:"120px", render:v=><span className="cell-dim">{v||"—"}</span> },
    { key:"attachments", label:"ATTACHED TO", w:"150px", render:(v)=>{
      if (!v?.length) return <span className="cell-dim">—</span>;
      const s = state.servers.find(s=>s.id===v[0].server_id);
      return <span style={{color:"#00aaff"}}>{s?.name||v[0].server_id?.slice(0,14)}</span>;
    }},
    { key:"created_at", label:"CREATED", w:"110px", render:v=><span className="cell-dim">{new Date(v).toLocaleDateString()}</span> },
    { key:"actions", label:"ACTIONS", w:"80px", render:(_,r)=>(
      <IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} />
    )},
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {showCreate && (
        <Modal title="CREATE VOLUME" onClose={()=>setShowCreate(false)}>
          <div className="form-grid">
            <Field label="NAME"><Input value={form.name} onChange={e=>set("name",e.target.value)} /></Field>
            <Field label="SIZE (GB) *"><Input type="number" min={1} value={form.size} onChange={e=>set("size",e.target.value)} /></Field>
            <Field label="VOLUME TYPE">
              <Select value={form.volume_type} onChange={e=>set("volume_type",e.target.value)}
                options={state.volumeTypes.map(t=>({value:t.name,label:t.name}))} placeholder="— default —" />
            </Field>
            <Field label="IMAGE SOURCE">
              <Select value={form.source_image} onChange={e=>set("source_image",e.target.value)}
                options={state.images.map(i=>({value:i.id,label:i.name}))} placeholder="— blank volume —" />
            </Field>
            <Field label="DESCRIPTION"><Input value={form.description} onChange={e=>set("description",e.target.value)} /></Field>
          </div>
          <div className="modal-footer">
            <Btn onClick={()=>setShowCreate(false)}>CANCEL</Btn>
            <Btn variant="primary" loading={loading} onClick={create}>CREATE VOLUME</Btn>
          </div>
        </Modal>
      )}
      <SectionHeader title="VOLUMES" actions={
        <>
          <Btn onClick={()=>load("volumes",volumeApi.list)}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE VOLUME</Btn>
        </>
      } />
      <Table cols={cols} rows={state.volumes} empty="No volumes found." loading={state.loading.volumes} />
    </div>
  );
}

// ── Images Page ───────────────────────────────────────────────────────────────
import { image as imageApi } from "../api/openstack.js";

export function Images() {
  const { state, load, toast } = useStore();
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");

  const del = (img) => setConfirm({
    title:"DELETE IMAGE", message:`Delete image "${img.name}"?`, danger:true,
    onConfirm: async()=>{
      try { await imageApi.delete(img.id); toast(`${img.name} deleted`,"ok"); load("images",imageApi.list); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const filtered = state.images.filter(i=>i.name?.toLowerCase().includes(search.toLowerCase()));

  const cols = [
    { key:"name",   label:"NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v||"Unnamed"}</div><div className="cell-mono">{r.id?.slice(0,24)}…</div></div> },
    { key:"status", label:"STATUS", w:"90px", render:v=><span style={{color:v==="active"?"#00ff88":"#888",fontWeight:700}}>{v}</span> },
    { key:"disk_format", label:"FORMAT", w:"80px", render:v=><Badge label={v?.toUpperCase()||"—"} color="#aa44ff" /> },
    { key:"size",   label:"SIZE", w:"90px", render:v=>v?`${Math.round(v/1e6)} MB`:"—" },
    { key:"visibility", label:"VISIBILITY", w:"100px", render:v=><Badge label={v?.toUpperCase()||"—"} color={v==="public"?"#00ffcc":"#888"} /> },
    { key:"min_disk", label:"MIN DISK", w:"90px", render:v=>`${v||0} GB` },
    { key:"created_at",label:"CREATED", w:"110px", render:v=><span className="cell-dim">{new Date(v).toLocaleDateString()}</span> },
    { key:"actions", label:"ACTIONS", w:"80px", render:(_,r)=>(
      <IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} />
    )},
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      <SectionHeader title="IMAGES" actions={
        <>
          <input className="ui-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{width:200,padding:"6px 10px"}} />
          <Btn onClick={()=>load("images",imageApi.list)}>↻ REFRESH</Btn>
        </>
      } />
      <Table cols={cols} rows={filtered} empty="No images found." loading={state.loading.images} />
    </div>
  );
}

// ── Key Pairs Page ────────────────────────────────────────────────────────────
import { compute as computeApi } from "../api/openstack.js";

export function KeyPairs() {
  const { state, load, toast } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:"", public_key:"" });
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [newKey, setNewKey] = useState(null);

  const create = async () => {
    if (!form.name) { toast("Name required","error"); return; }
    setLoading(true);
    try {
      const r = await computeApi.createKeypair({ keypair: { name:form.name, ...(form.public_key&&{public_key:form.public_key}) }});
      if (r.keypair?.private_key) setNewKey(r.keypair);
      toast("Key pair created!","ok");
      load("keypairs",computeApi.keypairs);
      setShowCreate(false);
    } catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };

  const del = (kp) => setConfirm({
    title:"DELETE KEY PAIR", message:`Delete key pair "${kp.name}"?`, danger:true,
    onConfirm: async()=>{
      try { await computeApi.deleteKeypair(kp.name); toast(`${kp.name} deleted`,"ok"); load("keypairs",computeApi.keypairs); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const kps = state.keypairs.map(k=>k.keypair||k);

  const cols = [
    { key:"name",        label:"NAME", w:"1fr" },
    { key:"fingerprint", label:"FINGERPRINT", w:"260px", render:v=><span className="cell-mono">{v}</span> },
    { key:"type",        label:"TYPE", w:"80px", render:v=><Badge label={v||"ssh"} color="#00aaff" /> },
    { key:"actions",     label:"ACTIONS", w:"80px", render:(_,r)=>(
      <IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} />
    )},
  ];

  return (
    <div className="page">
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
      {newKey && (
        <Modal title="SAVE YOUR PRIVATE KEY" onClose={()=>setNewKey(null)}>
          <div style={{color:"#ffaa00",fontSize:12,marginBottom:12}}>⚠ This is the only time you can download this key!</div>
          <pre className="console-log" style={{maxHeight:200,overflow:"auto"}}>{newKey.private_key}</pre>
          <Btn variant="primary" full onClick={()=>{
            const a=document.createElement("a"); a.href="data:text/plain,"+encodeURIComponent(newKey.private_key);
            a.download=newKey.name+".pem"; a.click();
          }}>⬇ DOWNLOAD .PEM</Btn>
        </Modal>
      )}
      {showCreate && (
        <Modal title="CREATE KEY PAIR" onClose={()=>setShowCreate(false)}>
          <div className="form-grid">
            <Field label="NAME *"><input className="ui-input" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></Field>
            <Field label="PUBLIC KEY (optional — leave blank to generate)">
              <textarea className="ui-input" rows={4} value={form.public_key} onChange={e=>setForm(p=>({...p,public_key:e.target.value}))} placeholder="ssh-rsa AAAA..." />
            </Field>
          </div>
          <div className="modal-footer">
            <Btn onClick={()=>setShowCreate(false)}>CANCEL</Btn>
            <Btn variant="primary" loading={loading} onClick={create}>CREATE</Btn>
          </div>
        </Modal>
      )}
      <SectionHeader title="KEY PAIRS" actions={
        <>
          <Btn onClick={()=>load("keypairs",computeApi.keypairs)}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE KEY PAIR</Btn>
        </>
      } />
      <Table cols={cols} rows={kps} empty="No key pairs." loading={state.loading.keypairs} />
    </div>
  );
}

// ── Network Topology ──────────────────────────────────────────────────────────
export function Topology() {
  const { state } = useStore();
  const { networks, routers, servers, subnets, floatingips } = state;
  const [hover, setHover] = useState(null);
  const externalNets = networks.filter(n => n["router:external"]);
  const internalNets = networks.filter(n => !n["router:external"]);
  const statusColor = s=>({ACTIVE:"#00ff88",SHUTOFF:"#ff4466",BUILD:"#ffaa00",ERROR:"#ff0055"})[s]||"#888";

  return (
    <div className="page">
      <SectionHeader title="NETWORK TOPOLOGY" />
      <div className="topology-legend">
        {[["⬡","#ff8800","External Network"],["⬟","#aa44ff","Router"],["◈","#00aaff","Network"],["⚡","#00ff88","Instance"]].map(([ic,c,l])=>(
          <span key={l} className="topo-leg"><span style={{color:c}}>{ic}</span>{l}</span>
        ))}
      </div>

      <div className="topology-canvas">
        {/* External Networks */}
        {externalNets.length>0 && (
          <div className="topo-tier">
            <div className="topo-tier-label">EXTERNAL NETWORKS</div>
            <div className="topo-tier-nodes">
              {externalNets.map(n=>(
                <div key={n.id} className="topo-node ext" onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(null)}>
                  <span style={{fontSize:22,color:"#ff8800"}}>⬡</span>
                  <div className="topo-node-name">{n.name}</div>
                  <div className="topo-node-sub">EXTERNAL</div>
                  {hover?.id===n.id && <div className="topo-tip">{n.id?.slice(0,20)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connector */}
        {externalNets.length>0&&routers.length>0&&<div className="topo-connector"><div className="topo-conn-line ext"/></div>}

        {/* Routers */}
        {routers.length>0 && (
          <div className="topo-tier">
            <div className="topo-tier-label">ROUTERS</div>
            <div className="topo-tier-nodes">
              {routers.map(r=>(
                <div key={r.id} className="topo-node router" onMouseEnter={()=>setHover(r)} onMouseLeave={()=>setHover(null)}>
                  <span style={{fontSize:22,color:"#aa44ff"}}>⬟</span>
                  <div className="topo-node-name">{r.name}</div>
                  <div className="topo-node-sub" style={{color:r.status==="ACTIVE"?"#00ff88":"#ff4466"}}>● {r.status}</div>
                  {hover?.id===r.id && <div className="topo-tip">{r.external_gateway_info?"Has Gateway":"No Gateway"}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connector */}
        {routers.length>0&&internalNets.length>0&&<div className="topo-connector"><div className="topo-conn-line net"/></div>}

        {/* Internal Networks */}
        {internalNets.length>0 && (
          <div className="topo-tier">
            <div className="topo-tier-label">NETWORKS</div>
            <div className="topo-tier-nodes">
              {internalNets.map(n=>{
                const sub=subnets.find(s=>s.network_id===n.id);
                return (
                  <div key={n.id} className="topo-node net" onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(null)}>
                    <span style={{fontSize:22,color:"#00aaff"}}>◈</span>
                    <div className="topo-node-name">{n.name}</div>
                    {sub&&<div className="topo-node-sub">{sub.cidr}</div>}
                    {hover?.id===n.id && <div className="topo-tip">{n.shared?"SHARED · ":""}{n.status}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Connector */}
        {internalNets.length>0&&servers.length>0&&<div className="topo-connector"><div className="topo-conn-line inst"/></div>}

        {/* Instances */}
        {servers.length>0 && (
          <div className="topo-tier">
            <div className="topo-tier-label">INSTANCES</div>
            <div className="topo-tier-nodes">
              {servers.map(s=>{
                const fip=floatingips.find(f=>Object.values(s.addresses||{}).flat().map(a=>a.addr).includes(f.fixed_ip_address));
                return (
                  <div key={s.id} className="topo-node inst" onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(null)}>
                    <span style={{fontSize:22,color:statusColor(s.status)}}>⚡</span>
                    <div className="topo-node-name">{s.name}</div>
                    <div className="topo-node-sub" style={{color:statusColor(s.status)}}>● {s.status}</div>
                    {fip&&<div className="topo-node-fip">⬡ {fip.floating_ip_address}</div>}
                    {hover?.id===s.id && <div className="topo-tip">{Object.values(s.addresses||{}).flat().map(a=>a.addr).join(", ")||"no IP"}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {networks.length===0&&servers.length===0&&<div className="empty-state"><div className="empty-icon">⋈</div><div>No topology data</div></div>}
      </div>
    </div>
  );
}

