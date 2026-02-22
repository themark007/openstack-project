// src/pages/SecurityGroups.jsx
import { useState, useCallback } from "react";
import { useStore } from "../hooks/useStore";
import { network } from "../api/openstack.js";
import { Table, Btn, Modal, Field, Input, Select, Badge, IconBtn, ConfirmModal, SectionHeader, Mono } from "../components/UI.jsx";

const PRESETS = [
  { label:"SSH",    protocol:"tcp", port_min:22,   port_max:22 },
  { label:"HTTP",   protocol:"tcp", port_min:80,   port_max:80 },
  { label:"HTTPS",  protocol:"tcp", port_min:443,  port_max:443 },
  { label:"ICMP",   protocol:"icmp",port_min:"",   port_max:"" },
  { label:"All TCP",protocol:"tcp", port_min:1,    port_max:65535 },
  { label:"All UDP",protocol:"udp", port_min:1,    port_max:65535 },
  { label:"MySQL",  protocol:"tcp", port_min:3306, port_max:3306 },
  { label:"PGSQL",  protocol:"tcp", port_min:5432, port_max:5432 },
  { label:"RDP",    protocol:"tcp", port_min:3389, port_max:3389 },
  { label:"SMTP",   protocol:"tcp", port_min:25,   port_max:25 },
  { label:"DNS",    protocol:"udp", port_min:53,   port_max:53 },
  { label:"MONGO",  protocol:"tcp", port_min:27017,port_max:27017 },
];

function AddRuleModal({ sg, onClose, onDone }) {
  const { toast } = useStore();
  const [form, setForm] = useState({ direction:"ingress", protocol:"tcp", port_min:"", port_max:"", remote_ip:"0.0.0.0/0", ethertype:"IPv4" });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const applyPreset = p => setForm(f=>({...f, protocol:p.protocol, port_min:p.port_min, port_max:p.port_max}));

  const save = async () => {
    setLoading(true);
    try {
      const body = {
        security_group_id: sg.id,
        direction: form.direction,
        ethertype: form.ethertype,
        protocol: form.protocol || null,
        ...(form.port_min!==""&&{port_range_min:parseInt(form.port_min)}),
        ...(form.port_max!==""&&{port_range_max:parseInt(form.port_max)}),
        ...(form.remote_ip&&{remote_ip_prefix:form.remote_ip}),
      };
      await network.createSgRule(body);
      toast("Rule added!","ok");
      onDone();
    } catch(e) { toast(e.message,"error"); }
    setLoading(false);
  };

  return (
    <Modal title={`ADD RULE — ${sg.name}`} onClose={onClose} wide>
      <div className="presets-row">
        {PRESETS.map(p=><button key={p.label} className="preset-btn" onClick={()=>applyPreset(p)}>{p.label}</button>)}
      </div>
      <div className="form-grid" style={{marginTop:14}}>
        <Field label="DIRECTION">
          <Select value={form.direction} onChange={e=>set("direction",e.target.value)}
            options={[{value:"ingress",label:"INGRESS (Inbound)"},{value:"egress",label:"EGRESS (Outbound)"}]} />
        </Field>
        <Field label="ETHERTYPE">
          <Select value={form.ethertype} onChange={e=>set("ethertype",e.target.value)}
            options={[{value:"IPv4",label:"IPv4"},{value:"IPv6",label:"IPv6"}]} />
        </Field>
        <Field label="PROTOCOL">
          <Select value={form.protocol} onChange={e=>set("protocol",e.target.value)}
            options={[{value:"tcp",label:"TCP"},{value:"udp",label:"UDP"},{value:"icmp",label:"ICMP"},{value:"",label:"Any"}]} />
        </Field>
        <Field label="PORT MIN"><Input value={form.port_min} onChange={e=>set("port_min",e.target.value)} placeholder="e.g. 80" /></Field>
        <Field label="PORT MAX"><Input value={form.port_max} onChange={e=>set("port_max",e.target.value)} placeholder="e.g. 80" /></Field>
        <Field label="REMOTE IP (CIDR)"><Input value={form.remote_ip} onChange={e=>set("remote_ip",e.target.value)} placeholder="0.0.0.0/0" /></Field>
      </div>
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={save}>ADD RULE</Btn>
      </div>
    </Modal>
  );
}

function CreateSgModal({ onClose, onDone }) {
  const { toast } = useStore();
  const [form, setForm] = useState({ name:"", description:"" });
  const [loading, setLoading] = useState(false);
  const create = async () => {
    if (!form.name) { toast("Name required","error"); return; }
    setLoading(true);
    try { await network.createSecgroup(form); toast("Security group created!","ok"); onDone(); }
    catch(e){ toast(e.message,"error"); }
    setLoading(false);
  };
  return (
    <Modal title="CREATE SECURITY GROUP" onClose={onClose}>
      <div className="form-grid">
        <Field label="NAME *"><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></Field>
        <Field label="DESCRIPTION"><Input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></Field>
      </div>
      <div className="modal-footer">
        <Btn onClick={onClose}>CANCEL</Btn>
        <Btn variant="primary" loading={loading} onClick={create}>CREATE</Btn>
      </div>
    </Modal>
  );
}

export default function SecurityGroups() {
  const { state, load, toast } = useStore();
  const [expanded, setExpanded] = useState(null);
  const [addRuleFor, setAddRuleFor] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const delRule = useCallback(async (ruleId, sgName) => {
    setConfirm({
      title:"DELETE RULE", message:`Delete this security rule from "${sgName}"?`, danger:true,
      onConfirm: async()=>{
        try { await network.deleteSgRule(ruleId); toast("Rule deleted","ok"); load("secgroups",network.secgroups); }
        catch(e){ toast(e.message,"error"); }
      }
    });
  }, [toast, load]);

  const delSg = useCallback((sg) => {
    setConfirm({
      title:"DELETE SECURITY GROUP", message:`Delete security group "${sg.name}"?`, danger:true,
      onConfirm: async()=>{
        try { await network.deleteSecgroup(sg.id); toast(`${sg.name} deleted`,"ok"); load("secgroups",network.secgroups); }
        catch(e){ toast(e.message,"error"); }
      }
    });
  }, [toast, load]);

  return (
    <div className="page">
      {showCreate && <CreateSgModal onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false);load("secgroups",network.secgroups);}} />}
      {addRuleFor && <AddRuleModal sg={addRuleFor} onClose={()=>setAddRuleFor(null)} onDone={()=>{setAddRuleFor(null);load("secgroups",network.secgroups);}} />}
      {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}

      <SectionHeader title="SECURITY GROUPS" actions={
        <>
          <Btn onClick={()=>load("secgroups",network.secgroups)}>↻ REFRESH</Btn>
          <Btn variant="primary" onClick={()=>setShowCreate(true)}>+ CREATE GROUP</Btn>
        </>
      } />

      {state.secgroups.map(sg => (
        <div key={sg.id} className="sg-card">
          <div className="sg-card-header" onClick={()=>setExpanded(expanded===sg.id?null:sg.id)}>
            <div>
              <span className="sg-name">{sg.name}</span>
              <span className="sg-desc">{sg.description}</span>
            </div>
            <div className="sg-card-actions">
              <span className="sg-rule-count">{sg.security_group_rules?.length||0} rules</span>
              <Btn sm variant="primary" onClick={e=>{e.stopPropagation();setAddRuleFor(sg);}}>+ RULE</Btn>
              <IconBtn icon="✕" color="#ff4466" title="Delete Group" onClick={e=>{e.stopPropagation();delSg(sg);}} />
              <span className="sg-chevron">{expanded===sg.id?"▲":"▼"}</span>
            </div>
          </div>

          {expanded===sg.id && (
            <div className="sg-rules">
              <div className="rules-head">
                <span>DIRECTION</span><span>PROTOCOL</span><span>PORT RANGE</span><span>REMOTE</span><span>ETHERTYPE</span><span></span>
              </div>
              {(sg.security_group_rules||[]).length===0 && <div className="rules-empty">No rules defined</div>}
              {(sg.security_group_rules||[]).map(r=>(
                <div key={r.id} className="rule-row-full">
                  <span className="rule-dir" style={{color:r.direction==="ingress"?"#00ffcc":"#ff8800"}}>
                    {r.direction==="ingress"?"▼ INGRESS":"▲ EGRESS"}
                  </span>
                  <span className="rule-proto">{r.protocol||"any"}</span>
                  <span className="rule-port">{r.port_range_min!=null?`${r.port_range_min}–${r.port_range_max}`:"all"}</span>
                  <span className="rule-cidr">{r.remote_ip_prefix||r.remote_group_id?.slice(0,16)||"any"}</span>
                  <span className="rule-ether">{r.ethertype}</span>
                  <IconBtn icon="✕" color="#ff4466" sm title="Delete Rule" onClick={()=>delRule(r.id,sg.name)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {state.secgroups.length===0 && <div className="empty-state"><div className="empty-icon">⬢</div><div>No security groups</div></div>}
    </div>
  );
}

