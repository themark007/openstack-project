// src/pages/RoleAssignment.jsx
import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useTheme';
import { GET, POST, DEL } from '../api/client.js';

const RC = { admin:'#ff4466', member:'#00ff88', reader:'#00aaff', _default:'#888' };
const rclr = (n) => RC[n] || RC._default;

function Badge({ label, color }) {
  return <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, padding:'2px 8px', border:`1px solid ${color}`, color, background:`${color}18`, borderRadius:'var(--radius)' }}>{label}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width:480 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-title"><span>{title}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function AssignModal({ users, projects, roles, onClose, onDone, toast }) {
  const [f, setF] = useState({ user_id:'', project_id:'', role_id:'' });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setF(p=>({...p,[k]:v}));

  const assign = async () => {
    if (!f.user_id||!f.project_id||!f.role_id) { toast('All fields required','error'); return; }
    setLoading(true);
    try {
      await POST('/identity/role-assignments', f);
      toast('Role assigned!','ok');
      onDone();
    } catch(e) { toast(e.message,'error'); }
    setLoading(false);
  };

  const sel = (val,opts,placeholder,onChange) => (
    <select className="ui-input" style={{width:'100%',padding:'8px 10px'}} value={val} onChange={e=>onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <Modal title="ASSIGN ROLE" onClose={onClose}>
      <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
        <div><div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>USER</div>{sel(f.user_id,users.map(u=>({value:u.id,label:`${u.name}${u.email?` (${u.email})`:''}`})),'— select user —',v=>set('user_id',v))}</div>
        <div><div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>PROJECT</div>{sel(f.project_id,projects.map(p=>({value:p.id,label:p.name})),'— select project —',v=>set('project_id',v))}</div>
        <div><div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>ROLE</div>{sel(f.role_id,roles.map(r=>({value:r.id,label:r.name})),'— select role —',v=>set('role_id',v))}</div>
      </div>
      <div className="modal-footer" style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 20px'}}>
        <button className="ui-btn" onClick={onClose}>CANCEL</button>
        <button className="ui-btn primary" onClick={assign} disabled={loading}>{loading?'…':'ASSIGN'}</button>
      </div>
    </Modal>
  );
}

export default function RoleAssignment() {
  const { state, toast } = useStore();
  const [assignments, setAssignments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [filterUser, setFilterUser] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [ra, rl] = await Promise.all([GET('/identity/role-assignments'), GET('/identity/roles')]);
      setAssignments(Array.isArray(ra)?ra:[]);
      setRoles(Array.isArray(rl)?rl:[]);
    } catch(e) { toast(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const revoke = async (a) => {
    if (!confirm(`Revoke this role assignment?`)) return;
    try {
      await DEL(`/identity/role-assignments?user_id=${a.user?.id}&project_id=${a.scope?.project?.id}&role_id=${a.role?.id}`);
      toast('Role revoked','ok'); load();
    } catch(e) { toast(e.message,'error'); }
  };

  const enriched = assignments
    .filter(a=>a.user&&a.scope?.project)
    .map(a=>({
      ...a,
      userName:    state.users.find(u=>u.id===a.user?.id)?.name    || a.user?.id?.slice(0,12)+'…',
      userEmail:   state.users.find(u=>u.id===a.user?.id)?.email   || '',
      projectName: state.projects.find(p=>p.id===a.scope?.project?.id)?.name || a.scope?.project?.id?.slice(0,12)+'…',
      roleName:    roles.find(r=>r.id===a.role?.id)?.name          || a.role?.id?.slice(0,12),
    }))
    .filter(a=>!filterUser||a.userName.toLowerCase().includes(filterUser.toLowerCase())||a.userEmail.toLowerCase().includes(filterUser.toLowerCase()));

  // per-user summary cards
  const userCards = state.users.map(u=>({
    ...u,
    myRoles: enriched.filter(a=>a.user?.id===u.id),
  }));

  return (
    <div className="page">
      {showAssign && (
        <AssignModal users={state.users} projects={state.projects} roles={roles}
          onClose={()=>setShowAssign(false)} onDone={()=>{setShowAssign(false);load();}} toast={toast} />
      )}

      {/* User summary cards */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:'var(--text-dim)',marginBottom:10}}>USER ROLE SUMMARY</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
          {userCards.map(u=>(
            <div key={u.id} style={{background:'var(--surface2)',border:'1px solid var(--border)',padding:'12px 14px',borderRadius:'var(--radius)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(0,255,200,.08)',border:'1px solid var(--border-hi)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'var(--accent)',flexShrink:0}}>◎</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</div>
                  <div style={{fontSize:10,color:'var(--text-dim)'}}>{u.email||'no email'}</div>
                </div>
              </div>
              {u.myRoles.length===0
                ? <div style={{fontSize:11,color:'var(--danger)',padding:'4px 8px',background:'rgba(255,68,102,.06)',borderRadius:4}}>⚠ No roles — cannot login to project</div>
                : u.myRoles.map((a,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',borderBottom:i<u.myRoles.length-1?'1px solid var(--border)':'none'}}>
                    <span style={{fontSize:11,color:'var(--text-dim)'}}>{a.projectName}</span>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <Badge label={(a.roleName||'').toUpperCase()} color={rclr(a.roleName)} />
                      <button onClick={()=>revoke(a)} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:12,lineHeight:1,padding:2}} title="Revoke">✕</button>
                    </div>
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      </div>

      {/* Section header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,paddingBottom:10,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:2,color:'var(--text-dim)'}}>ALL ROLE ASSIGNMENTS {loading&&'…'}</div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input className="ui-input" value={filterUser} onChange={e=>setFilterUser(e.target.value)} placeholder="Filter by user…" style={{padding:'6px 10px',width:180}} />
          <button className="ui-btn" onClick={load}>↻</button>
          <button className="ui-btn primary" onClick={()=>setShowAssign(true)}>+ ASSIGN ROLE</button>
        </div>
      </div>

      {/* Table */}
      <div className="data-table">
        <div className="table-head" style={{display:'grid',gridTemplateColumns:'1fr 180px 120px 50px',padding:'8px 14px',gap:12}}>
          <span>USER</span><span>PROJECT</span><span>ROLE</span><span></span>
        </div>
        {enriched.length===0&&!loading&&<div style={{padding:'24px',textAlign:'center',color:'var(--text-dim)',fontSize:12}}>No role assignments found.</div>}
        {enriched.map((a,i)=>(
          <div key={i} className="table-row" style={{display:'grid',gridTemplateColumns:'1fr 180px 120px 50px',padding:'10px 14px',gap:12,alignItems:'center'}}>
            <div><div className="cell-primary">{a.userName}</div><div className="cell-mono" style={{fontSize:10}}>{a.userEmail}</div></div>
            <div className="cell-primary">{a.projectName}</div>
            <div><Badge label={(a.roleName||'').toUpperCase()} color={rclr(a.roleName)} /></div>
            <button onClick={()=>revoke(a)} className="ui-btn" style={{padding:'4px 8px',fontSize:11,color:'var(--danger)',borderColor:'rgba(255,68,102,.3)'}}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}