// src/pages/Network.jsx
import { useState } from "react";
import { useStore } from "../hooks/useStore";
import { network } from "../api/openstack.js";
import { Table, Btn, Modal, Field, Input, Select, Toggle, Badge, StatusDot, IconBtn, ConfirmModal, SectionHeader, Tabs, Mono } from "../components/UI.jsx";

// ── Create Network Modal ──────────────────────────────────────────────────────
function CreateNetModal({ onClose, onDone }) {
  const { toast } = useStore();
  const [form, setForm] = useState({ name:"", cidr:"10.0.0.0/24", subnet_name:"", enable_dhcp:true, shared:false, external:false, dns:"8.8.8.8,8.8.4.4", ip_version:"4" });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const create = async () => {
    if (!form.name) { toast("Network name required","error"); return; }
    setLoading(true);
    try {
      await network.createNetwork({ name:form.name, shared:form.shared, external:form.external, cidr:form.cidr||undefined, subnet_name:form.subnet_name||undefined, enable_dhcp:form.enable_dhcp, ip_version:parseInt(form.ip_version), dns_nameservers:form.dns?form.dns.split(",").map(s=>s.trim()):[] });
      toast(`Network "${form.name}" created!`,"ok");
      onDone();
    } catch(e) { toast(`Failed: ${e.message}`,"error"); }
    setLoading(false);
  };

  return (
    <Modal title="CREATE NETWORK" onClose={onClose}>
      <div className="form-grid">
        <Field label="NETWORK NAME *"><Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="my-network" /></Field>
        <Field label="IP VERSION">
          <Select value={form.ip_version} onChange={e=>set("ip_version",e.target.value)} options={[{value:"4",label:"IPv4"},{value:"6",label:"IPv6"}]} />
        </Field>
        <Field label="SUBNET CIDR"><Input value={form.cidr} onChange={e=>set("cidr",e.target.value)} placeholder="10.0.0.0/24" /></Field>
        <Field label="SUBNET NAME"><Input value={form.subnet_name} onChange={e=>set("subnet_name",e.target.value)} placeholder="my-subnet (optional)" /></Field>
        <Field label="DNS NAMESERVERS"><Input value={form.dns} onChange={e=>set("dns",e.target.value)} placeholder="8.8.8.8,8.8.4.4" /></Field>
      </div>
      <div className="toggle-row">
        <Toggle label="ENABLE DHCP" checked={form.enable_dhcp} onChange={v=>set("enable_dhcp",v)} />
        <Toggle label="SHARED" checked={form.shared} onChange={v=>set("shared",v)} />
        <Toggle label="EXTERNAL" checked={form.external} onChange={v=>set("external",v)} />
      </div>
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={create}>CREATE NETWORK</Btn>
      </div>
    </Modal>
  );
}

// ── Subnet Detail Modal ───────────────────────────────────────────────────────
function SubnetModal({ netId, netName, onClose }) {
  const { state, toast } = useStore();
  const subs = state.subnets.filter(s => s.network_id === netId);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name:"", cidr:"", ip_version:"4", enable_dhcp:true });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const add = async () => {
    if (!form.cidr) { toast("CIDR required","error"); return; }
    setLoading(true);
    try {
      await network.createSubnet({ network_id:netId, name:form.name, cidr:form.cidr, ip_version:parseInt(form.ip_version), enable_dhcp:form.enable_dhcp });
      toast("Subnet created!","ok");
      setAdding(false);
    } catch(e) { toast(e.message,"error"); }
    setLoading(false);
  };

  return (
    <Modal title={`SUBNETS — ${netName}`} onClose={onClose} wide>
      <Table
        cols={[
          { key:"name",  label:"NAME", w:"1fr" },
          { key:"cidr",  label:"CIDR", w:"150px", render:v=><Mono>{v}</Mono> },
          { key:"ip_version", label:"IP", w:"50px", render:v=>`v${v}` },
          { key:"enable_dhcp", label:"DHCP", w:"70px", render:v=><span style={{color:v?"#00ff88":"#ff4466"}}>{v?"ON":"OFF"}</span> },
          { key:"gateway_ip", label:"GATEWAY", w:"140px", render:v=><Mono>{v||"—"}</Mono> },
        ]}
        rows={subs}
      />
      {adding ? (
        <div className="form-grid" style={{marginTop:14}}>
          <Field label="NAME"><Input value={form.name} onChange={e=>set("name",e.target.value)} /></Field>
          <Field label="CIDR *"><Input value={form.cidr} onChange={e=>set("cidr",e.target.value)} placeholder="192.168.1.0/24" /></Field>
          <Field label="IP VERSION"><Select value={form.ip_version} onChange={e=>set("ip_version",e.target.value)} options={[{value:"4",label:"IPv4"},{value:"6",label:"IPv6"}]} /></Field>
          <Field><Toggle label="DHCP" checked={form.enable_dhcp} onChange={v=>set("enable_dhcp",v)} /></Field>
          <div style={{display:"flex",gap:8,gridColumn:"span 2"}}>
            <Btn onClick={()=>setAdding(false)}>CANCEL</Btn>
            <Btn variant="primary" loading={loading} onClick={add}>ADD SUBNET</Btn>
          </div>
        </div>
      ) : (
        <div style={{marginTop:14}}><Btn variant="primary" onClick={()=>setAdding(true)}>+ ADD SUBNET</Btn></div>
      )}
    </Modal>
  );
}

// ── Main Network Page ─────────────────────────────────────────────────────────
export default function NetworkPage() {
  const { state, load, toast } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [subnetNet, setSubnetNet] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");

  const del = (n) => setConfirm({
    title:"DELETE NETWORK", message:`Delete network "${n.name}"? All associated subnets will also be deleted.`, danger:true,
    onConfirm: async()=>{
      try { await network.deleteNetwork(n.id); toast(`${n.name} deleted`,"ok"); load("networks",network.networks); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const filtered = state.networks.filter(n => n.name?.toLowerCase().includes(search.toLowerCase()));

  const cols = [
    { key:"name",   label:"NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v}</div><div className="cell-mono">{r.id?.slice(0,24)}…</div></div> },
    { key:"status", label:"STATUS", w:"90px", render:v=><StatusDot status={v} /> },
    { key:"shared", label:"SHARED", w:"80px", render:v=><span style={{color:v?"#00ffcc":"#888"}}>{v?"YES":"NO"}</span> },
    { key:"ext",    label:"TYPE", w:"100px", render:(_,r)=><Badge label={r["router:external"]?"EXTERNAL":"INTERNAL"} color={r["router:external"]?"#ff8800":"#00aaff"} /> },
    { key:"admin_state_up", label:"ADMIN", w:"80px", render:v=><span style={{color:v?"#00ff88":"#ff4466"}}>{v?"UP":"DOWN"}</span> },
    { key:"subnets",label:"SUBNETS", w:"100px", render:(_,r)=>{
      const cnt = state.subnets.filter(s=>s.network_id===r.id).length;
      return <Btn sm onClick={()=>setSubnetNet(r)}>{cnt} subnet{cnt!==1?"s":""}</Btn>;
    }},
    { key:"actions",label:"ACTIONS", w:"90px", render:(_,r)=>(
      <div className="action-row">
        <IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} />
      </div>
    )},
  ];

  return (
    <div className="page">
      {showCreate && <CreateNetModal onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false);load("networks",network.networks);load("subnets",network.subnets);}} />}
      {subnetNet && <SubnetModal netId={subnetNet.id} netName={subnetNet.name} onClose={()=>setSubnetNet(null)} />}
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}

      <SectionHeader title="NETWORKS" actions={
        <>
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{width:200,padding:"6px 10px"}} />
          <Btn onClick={()=>load("networks",network.networks)}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE NETWORK</Btn>
        </>
      } />
      <Table cols={cols} rows={filtered} empty="No networks found." loading={state.loading.networks} />
    </div>
  );
}

