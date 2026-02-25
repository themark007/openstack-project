// src/pages/TopologyV2.jsx — clickable nodes with detail/edit modals
import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../hooks/useTheme';
import { GET, POST, PUT, DEL } from '../api/client.js';

// ── Detail/Edit Modal ─────────────────────────────────────────────────────────
function NodeModal({ node, onClose, toast, onRefresh }) {
  const [tab, setTab]         = useState('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (node.type === 'network') setForm({ name: node.raw?.name||'', admin_state_up: node.raw?.admin_state_up });
    if (node.type === 'router')  setForm({ name: node.raw?.name||'', admin_state_up: node.raw?.admin_state_up });
    if (node.type === 'subnet')  setForm({ name: node.raw?.name||'', enable_dhcp: node.raw?.enable_dhcp });
  }, [node]);

  const save = async () => {
    setLoading(true);
    try {
      if (node.type==='network') await PUT(`/network/networks/${node.raw.id}`, form);
      if (node.type==='router')  await PUT(`/network/routers/${node.raw.id}`,  form);
      if (node.type==='subnet')  await PUT(`/network/subnets/${node.raw.id}`,  form);
      toast('Updated!', 'ok');
      setEditing(false);
      onRefresh();
    } catch(e) { toast(e.message,'error'); }
    setLoading(false);
  };

  const deleteNode = async () => {
    if (!confirm(`Delete ${node.type} "${node.label}"?`)) return;
    setLoading(true);
    try {
      if (node.type==='network') await DEL(`/network/networks/${node.raw.id}`);
      if (node.type==='router')  await DEL(`/network/routers/${node.raw.id}`);
      if (node.type==='subnet')  await DEL(`/network/subnets/${node.raw.id}`);
      if (node.type==='floatingip') await DEL(`/network/floatingips/${node.raw.id}`);
      toast(`${node.type} deleted`,'ok');
      onRefresh();
      onClose();
    } catch(e) { toast(e.message,'error'); }
    setLoading(false);
  };

  const raw = node.raw || {};
  const infoRows = (() => {
    switch(node.type) {
      case 'network': return [['ID',raw.id],['Status',raw.status],['External',String(raw['router:external'])],['Shared',String(raw.shared)],['Admin State',String(raw.admin_state_up)]];
      case 'router':  return [['ID',raw.id],['Status',raw.status],['Admin State',String(raw.admin_state_up)],['External GW',raw.external_gateway_info?.network_id?.slice(0,20)||'none']];
      case 'subnet':  return [['ID',raw.id],['CIDR',raw.cidr],['IP Version',`IPv${raw.ip_version}`],['Gateway',raw.gateway_ip],['DHCP',String(raw.enable_dhcp)],['DNS',raw.dns_nameservers?.join(', ')||'—']];
      case 'server':  return [['ID',raw.id],['Status',raw.status],['Flavor',raw.flavor?.original_name||raw.flavor?.id],['AZ',raw['OS-EXT-AZ:availability_zone']||'—'],['Host',raw['OS-EXT-SRV-ATTR:host']||'—']];
      case 'floatingip': return [['ID',raw.id],['Float IP',raw.floating_ip_address],['Fixed IP',raw.fixed_ip_address||'unassigned'],['Status',raw.status]];
      default: return [];
    }
  })();

  const ICON = { network:'◎', router:'⬟', subnet:'◑', server:'⚡', floatingip:'◆', port:'⋮' };
  const COLOR= { network:'#00ffcc', router:'#ffaa00', subnet:'#00aaff', server:'#00ff88', floatingip:'#aa44ff', port:'#888' };
  const c = COLOR[node.type]||'#888';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{width:460}} onClick={e=>e.stopPropagation()}>
        <div className="modal-title">
          <span style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:18,color:c}}>{ICON[node.type]}</span>
            <span style={{color:c,letterSpacing:2,fontSize:12}}>{node.type.toUpperCase()} — {node.label}</span>
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="tab-bar" style={{padding:'0 20px'}}>
          <button className={`tab-btn ${tab==='info'?'active':''}`}   onClick={()=>setTab('info')}>INFO</button>
          {['network','router','subnet'].includes(node.type)&&<button className={`tab-btn ${tab==='edit'?'active':''}`} onClick={()=>setTab('edit')}>EDIT</button>}
        </div>

        <div style={{padding:'16px 20px',maxHeight:'50vh',overflowY:'auto'}}>
          {tab==='info'&&(
            <div>
              {infoRows.map(([k,v])=>v!=null&&(
                <div key={k} style={{display:'flex',borderBottom:'1px solid var(--border)',padding:'7px 0'}}>
                  <span style={{width:120,flexShrink:0,fontSize:10,letterSpacing:1,color:'var(--text-dim)'}}>{k}</span>
                  <span style={{fontSize:12,color:'var(--text)',fontFamily:'var(--font-mono)',wordBreak:'break-all'}}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {tab==='edit'&&(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <div style={{fontSize:10,letterSpacing:1,color:'var(--text-dim)',marginBottom:6}}>NAME</div>
                <input className="ui-input" style={{width:'100%',padding:'8px 10px',boxSizing:'border-box'}} value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
              </div>
              {(node.type==='network'||node.type==='router')&&(
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!form.admin_state_up} onChange={e=>setForm(p=>({...p,admin_state_up:e.target.checked}))} style={{accentColor:'var(--accent)'}}/>
                  <span style={{fontSize:12,color:'var(--text-dim)'}}>Admin State Up</span>
                </label>
              )}
              {node.type==='subnet'&&(
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!form.enable_dhcp} onChange={e=>setForm(p=>({...p,enable_dhcp:e.target.checked}))} style={{accentColor:'var(--accent)'}}/>
                  <span style={{fontSize:12,color:'var(--text-dim)'}}>Enable DHCP</span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{display:'flex',justifyContent:'space-between',padding:'12px 20px'}}>
          <div>
            {!['server'].includes(node.type)&&(
              <button className="ui-btn" onClick={deleteNode} disabled={loading} style={{color:'var(--danger)',borderColor:'rgba(255,68,102,.3)'}}>
                {loading?'…':'✕ DELETE'}
              </button>
            )}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="ui-btn" onClick={onClose}>CLOSE</button>
            {tab==='edit'&&<button className="ui-btn primary" onClick={save} disabled={loading}>{loading?'…':'SAVE'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Topology Canvas ───────────────────────────────────────────────────────────
const NODE_R = 28;
const TYPE_COLOR = { network:'#00ffcc', router:'#ffaa00', subnet:'#00aaff', server:'#00ff88', floatingip:'#aa44ff', port:'#555' };
const TYPE_ICON  = { network:'NET',      router:'RTR',     subnet:'SUB',     server:'VM',      floatingip:'FIP',     port:'◉' };

function buildGraph(networks, routers, servers, subnets, floatingips, ports) {
  const nodes = [];
  const edges = [];
  let x = 60;

  // Layout: external net → router → internal nets → subnets → servers
  const external = networks.filter(n=>n['router:external']);
  const internal = networks.filter(n=>!n['router:external']);

  const addN = (id, label, type, raw, cx, cy) => nodes.push({ id, label, type, raw, x:cx, y:cy });

  let ey = 100;
  external.forEach(n => { addN(n.id,n.name,'network',n,100,ey); ey+=120; });

  let ry = 100;
  routers.forEach(r => {
    addN(r.id,r.name,'router',r,280,ry);
    // edge: router ↔ external nets
    const gwNet = r.external_gateway_info?.network_id;
    if (gwNet) edges.push({ from:r.id, to:gwNet });
    ry+=120;
  });

  let ny = 60;
  internal.forEach(n => {
    addN(n.id,n.name,'network',n,480,ny);
    ny+=100;
    // subnets
    subnets.filter(s=>s.network_id===n.id).forEach(s => {
      addN(s.id,s.cidr||s.name,'subnet',s,680,ny-60);
      edges.push({ from:n.id, to:s.id });
    });
  });

  // Router interfaces → internal networks (from ports)
  ports.filter(p=>p.device_owner==='network:router_interface'||p.device_owner==='network:router_interface_distributed').forEach(p=>{
    const routerId = p.device_id;
    if (routerId && nodes.find(n=>n.id===routerId)) {
      edges.push({ from:routerId, to:p.network_id });
    }
  });

  // Servers
  let sy = 80;
  servers.forEach(s=>{
    const ips = Object.values(s.addresses||{}).flat();
    addN(s.id,s.name,'server',s,880,sy);
    sy+=90;
    // edge: server → networks it's on
    ips.forEach(ip=>{
      const net = internal.find(n=>{ const sub=subnets.find(sb=>sb.network_id===n.id); return sub; });
      if (net) edges.push({ from:s.id, to:net.id });
    });
    // FIP edges
    const fip = floatingips.find(f=>f.fixed_ip_address&&ips.find(i=>i.addr===f.fixed_ip_address));
    if (fip) {
      if (!nodes.find(n=>n.id===fip.id)) addN(fip.id,fip.floating_ip_address,'floatingip',fip,1080,sy-50);
      edges.push({ from:s.id, to:fip.id });
    }
  });

  return { nodes, edges };
}

export default function TopologyV2() {
  const { state, toast, refresh } = useStore();
  const svgRef  = useRef(null);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom]         = useState(1);
  const [pan,  setPan]          = useState({ x:0, y:0 });
  const [dragging, setDragging] = useState(null);
  const [positions, setPositions] = useState({});

  const { servers, networks, routers, subnets, floatingips } = state;
  const [ports, setPorts] = useState([]);

  useEffect(() => {
    GET('/network/ports').then(p=>setPorts(Array.isArray(p)?p:[])).catch(()=>{});
  }, []);

  const graph = buildGraph(networks, routers, servers, subnets||[], floatingips, ports);

  // Merge computed positions with user-dragged positions
  const nodes = graph.nodes.map(n=>({ ...n, x: positions[n.id]?.x ?? n.x, y: positions[n.id]?.y ?? n.y }));
  const edges = graph.edges;

  // Drag logic
  const startDrag = (e, id) => {
    e.stopPropagation();
    const svg = svgRef.current;
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    setDragging({ id, ox: sp.x - (positions[id]?.x ?? nodes.find(n=>n.id===id)?.x ?? 0), oy: sp.y - (positions[id]?.y ?? nodes.find(n=>n.id===id)?.y ?? 0) });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    const svg = svgRef.current;
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    setPositions(p=>({...p,[dragging.id]:{ x:sp.x-dragging.ox, y:sp.y-dragging.oy }}));
  };
  const stopDrag = () => setDragging(null);

  const onNodeClick = (e, node) => {
    e.stopPropagation();
    if (!dragging) setSelected(node);
  };

  const nodeById = (id) => nodes.find(n=>n.id===id);
  const typeCount = (t) => nodes.filter(n=>n.type===t).length;

  return (
    <div className="page" style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {selected && (
        <NodeModal node={selected} onClose={()=>setSelected(null)} toast={toast}
          onRefresh={()=>{ refresh(); setSelected(null); }} />
      )}

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        {[['◎','network','Networks'],['⬟','router','Routers'],['◑','subnet','Subnets'],['⚡','server','Servers'],['◆','floatingip','FIPs']].map(([ic,type,lbl])=>(
          <div key={type} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',background:'var(--surface2)',border:`1px solid ${TYPE_COLOR[type]}33`,borderRadius:'var(--radius)'}}>
            <span style={{color:TYPE_COLOR[type]}}>{ic}</span>
            <span style={{fontSize:11,color:'var(--text-dim)'}}>{lbl}</span>
            <span style={{fontSize:12,fontWeight:700,color:TYPE_COLOR[type]}}>{typeCount(type)}</span>
          </div>
        ))}
        <div style={{flex:1}}/>
        <button className="ui-btn" style={{fontSize:11}} onClick={()=>setZoom(z=>Math.min(2,z+.15))}>+ ZOOM</button>
        <button className="ui-btn" style={{fontSize:11}} onClick={()=>setZoom(z=>Math.max(.3,z-.15))}>− ZOOM</button>
        <button className="ui-btn" style={{fontSize:11}} onClick={()=>{setZoom(1);setPan({x:0,y:0});setPositions({})}}>↺ RESET</button>
        <div style={{fontSize:10,color:'var(--text-dim)'}}>Click nodes to inspect • Drag to reposition</div>
      </div>

      {/* SVG canvas */}
      <div style={{flex:1,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden',position:'relative'}}>
        <svg ref={svgRef} width="100%" height="100%" style={{cursor:dragging?'grabbing':'default'}}
          onMouseMove={onMouseMove} onMouseUp={stopDrag} onMouseLeave={stopDrag}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(0,255,200,.3)"/>
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((e,i)=>{
              const a = nodeById(e.from);
              const b = nodeById(e.to);
              if (!a||!b) return null;
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="rgba(0,255,200,.18)" strokeWidth={1.5} strokeDasharray="4,4"
                  markerEnd="url(#arrow)"/>
              );
            })}

            {/* Nodes */}
            {nodes.map(node=>{
              const c = TYPE_COLOR[node.type]||'#888';
              const isSelected = selected?.id===node.id;
              return (
                <g key={node.id} style={{cursor:'pointer'}}
                  onMouseDown={e=>startDrag(e,node.id)}
                  onClick={e=>onNodeClick(e,node)}>
                  {/* Glow ring when selected */}
                  {isSelected&&<circle cx={node.x} cy={node.y} r={NODE_R+8} fill="none" stroke={c} strokeWidth={2} opacity={.5} filter="url(#glow)"/>}
                  {/* Main circle */}
                  <circle cx={node.x} cy={node.y} r={NODE_R} fill={`${c}14`} stroke={c} strokeWidth={isSelected?2:1} />
                  {/* Icon text */}
                  <text x={node.x} y={node.y-3} textAnchor="middle" dominantBaseline="middle"
                    fill={c} fontSize={9} fontWeight={700} fontFamily="'Share Tech Mono',monospace" letterSpacing={1}>
                    {TYPE_ICON[node.type]||'?'}
                  </text>
                  {/* Status dot for servers */}
                  {node.type==='server'&&(
                    <circle cx={node.x+NODE_R-4} cy={node.y-NODE_R+4} r={5}
                      fill={node.raw?.status==='ACTIVE'?'#00ff88':'#ff4466'}/>
                  )}
                  {/* Label below */}
                  <text x={node.x} y={node.y+NODE_R+12} textAnchor="middle"
                    fill="var(--text-dim)" fontSize={9} fontFamily="'Share Tech Mono',monospace">
                    {(node.label||'').slice(0,18)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Empty state */}
        {nodes.length===0&&(
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',color:'var(--text-dim)'}}>
            <div style={{fontSize:40,marginBottom:12}}>◎</div>
            <div>No network resources to display</div>
          </div>
        )}
      </div>
    </div>
  );
}