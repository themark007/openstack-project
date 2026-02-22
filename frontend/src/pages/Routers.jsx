// src/pages/Routers.jsx
import { useState } from "react";
import { useStore } from "../hooks/useStore";
import { network } from "../api/openstack.js";
import { Table, Btn, Modal, Field, Input, Select, Toggle, Badge, StatusDot, IconBtn, ConfirmModal, SectionHeader, Mono } from "../components/UI.jsx";

function CreateRouterModal({ onClose, onDone }) {
  const { state, toast } = useStore();
  const [form, setForm] = useState({ name:"", admin_state_up:true, external_network_id:"" });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const extNets = state.networks.filter(n => n["router:external"]);

  const create = async () => {
    if (!form.name) { toast("Router name required","error"); return; }
    setLoading(true);
    try {
      const body = {
        name: form.name,
        admin_state_up: form.admin_state_up,
        ...(form.external_network_id && { external_gateway_info: { network_id: form.external_network_id } })
      };
      await network.createRouter(body);
      toast(`Router "${form.name}" created!`,"ok");
      onDone();
    } catch(e) { toast(e.message,"error"); }
    setLoading(false);
  };

  return (
    <Modal title="CREATE ROUTER" onClose={onClose}>
      <div className="form-grid">
        <Field label="ROUTER NAME *"><Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="my-router" /></Field>
        <Field label="EXTERNAL NETWORK">
          <Select value={form.external_network_id} onChange={e=>set("external_network_id",e.target.value)}
            options={extNets.map(n=>({value:n.id,label:n.name}))} placeholder="— none —" />
        </Field>
      </div>
      <Toggle label="ADMIN STATE UP" checked={form.admin_state_up} onChange={v=>set("admin_state_up",v)} />
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={create}>CREATE ROUTER</Btn>
      </div>
    </Modal>
  );
}

function AddInterfaceModal({ router, onClose, onDone }) {
  const { state, toast } = useStore();
  const [subnetId, setSubnetId] = useState("");
  const [loading, setLoading] = useState(false);

  const add = async () => {
    if (!subnetId) { toast("Select a subnet","error"); return; }
    setLoading(true);
    try {
      await network.addRouterInterface(router.id, { subnet_id: subnetId });
      toast("Interface added!","ok");
      onDone();
    } catch(e) { toast(e.message,"error"); }
    setLoading(false);
  };

  return (
    <Modal title={`ADD INTERFACE — ${router.name}`} onClose={onClose}>
      <Field label="SUBNET">
        <Select value={subnetId} onChange={e=>setSubnetId(e.target.value)}
          options={state.subnets.map(s=>({value:s.id,label:`${s.name} (${s.cidr})`}))}
          placeholder="— select subnet —" />
      </Field>
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={add}>ADD INTERFACE</Btn>
      </div>
    </Modal>
  );
}

export default function Routers() {
  const { state, load, toast } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [interfaceRouter, setInterfaceRouter] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const del = (r) => setConfirm({
    title:"DELETE ROUTER", message:`Delete router "${r.name}"? Remove all interfaces first.`, danger:true,
    onConfirm: async()=>{
      try { await network.deleteRouter(r.id); toast(`${r.name} deleted`,"ok"); load("routers",network.routers); }
      catch(e){ toast(e.message,"error"); }
    }
  });

  const cols = [
    { key:"name",   label:"NAME", w:"1fr", render:(v,r)=><div><div className="cell-primary">{v}</div><div className="cell-mono">{r.id?.slice(0,24)}…</div></div> },
    { key:"status", label:"STATUS", w:"90px", render:v=><StatusDot status={v} /> },
    { key:"admin_state_up", label:"ADMIN", w:"80px", render:v=><span style={{color:v?"#00ff88":"#ff4466"}}>{v?"UP":"DOWN"}</span> },
    { key:"gw",     label:"EXTERNAL GW", w:"150px", render:(_,r)=>{
      const gw = r.external_gateway_info;
      if (!gw) return <span className="cell-dim">—</span>;
      const net = state.networks.find(n=>n.id===gw.network_id);
      return <span style={{color:"#ff8800"}}>{net?.name||gw.network_id?.slice(0,14)}</span>;
    }},
    { key:"actions",label:"ACTIONS", w:"130px", render:(_,r)=>(
      <div className="action-row">
        <IconBtn icon="+" color="#00ffcc" title="Add Interface" onClick={()=>setInterfaceRouter(r)} />
        <IconBtn icon="✕" color="#ff4466" title="Delete" onClick={()=>del(r)} />
      </div>
    )},
  ];

  return (
    <div className="page">
      {showCreate && <CreateRouterModal onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false);load("routers",network.routers);}} />}
      {interfaceRouter && <AddInterfaceModal router={interfaceRouter} onClose={()=>setInterfaceRouter(null)} onDone={()=>setInterfaceRouter(null)} />}
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}

      <SectionHeader title="ROUTERS" actions={
        <>
          <Btn onClick={()=>load("routers",network.routers)}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE ROUTER</Btn>
        </>
      } />
      <Table cols={cols} rows={state.routers} empty="No routers found." loading={state.loading.routers} />
    </div>
  );
}

