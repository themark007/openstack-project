// src/pages/ResourceCharts.jsx
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useTheme';
import { GET } from '../api/client.js';

const COLORS = ['#00ffcc','#00aaff','#aa44ff','#ff8800','#00ff88','#ff4466'];

function Arc({ pct, color, size=80, stroke=8, label, sublabel }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:'stroke-dasharray .8s cubic-bezier(.4,0,.2,1)'}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={14} fontWeight={700} fontFamily="'Share Tech Mono',monospace"
          style={{transform:'rotate(90deg)',transformOrigin:`${size/2}px ${size/2}px`}}>
          {pct}%
        </text>
      </svg>
      <div style={{fontSize:10,color:'var(--text-dim)',letterSpacing:1,textAlign:'center'}}>{label}</div>
      {sublabel&&<div style={{fontSize:9,color:'var(--text-muted)',textAlign:'center'}}>{sublabel}</div>}
    </div>
  );
}

function Bar({ label, used, total, color, unit='' }) {
  const pct = total > 0 ? Math.min(100, Math.round((used/total)*100)) : 0;
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:11,color:'var(--text-dim)'}}>{label}</span>
        <span style={{fontSize:11,color,fontFamily:'var(--font-mono)'}}>{used}{unit} / {total}{unit} ({pct}%)</span>
      </div>
      <div style={{height:6,background:'rgba(255,255,255,.06)',borderRadius:3}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:3,transition:'width .8s ease'}}/>
      </div>
    </div>
  );
}

function MiniSparkline({ data, color, width=120, height=40 }) {
  if (!data||data.length<2) return <div style={{width,height,background:'rgba(255,255,255,.03)',borderRadius:4}}/>;
  const max = Math.max(...data, 1);
  const pts = data.map((v,i)=>`${(i/(data.length-1))*width},${height-(v/max)*height}`).join(' ');
  return (
    <svg width={width} height={height} style={{overflow:'visible'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} opacity={.8}/>
      <polyline points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity={.1}/>
    </svg>
  );
}

export default function ResourceCharts() {
  const { state } = useStore();
  const [history, setHistory]   = useState({}); // hypervisor_id → [{cpu,ram,ts}]
  const [usageSamples, setUsageSamples] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef(null);

  const hypervisors = state.hypervisors || [];

  // Accumulate history samples every 30s
  const sample = async () => {
    setRefreshing(true);
    const now = Date.now();
    const newSamples = hypervisors.map(h => ({
      id: h.id,
      cpu_pct: h.cpu_info ? Math.round((h.vcpus_used / Math.max(h.vcpus,1))*100) : 0,
      ram_pct: h.memory_mb ? Math.round((h.memory_mb_used / Math.max(h.memory_mb,1))*100) : 0,
      ts: now,
    }));
    setHistory(prev => {
      const next = {...prev};
      newSamples.forEach(s => {
        if (!next[s.id]) next[s.id] = [];
        next[s.id] = [...next[s.id].slice(-29), s];
      });
      return next;
    });
    // Also get tenant usage
    try {
      const u = await GET('/compute/usage');
      if (u?.tenant_usages) {
        setUsageSamples(u.tenant_usages);
      }
    } catch(_) {}
    setRefreshing(false);
  };

  useEffect(() => {
    sample();
    timerRef.current = setInterval(sample, 30000);
    return () => clearInterval(timerRef.current);
  }, [hypervisors.length]);

  // Cluster totals
  const totals = hypervisors.reduce((acc, h) => ({
    vcpus:         acc.vcpus        + (h.vcpus||0),
    vcpus_used:    acc.vcpus_used   + (h.vcpus_used||0),
    ram_mb:        acc.ram_mb       + (h.memory_mb||0),
    ram_used_mb:   acc.ram_used_mb  + (h.memory_mb_used||0),
    disk_gb:       acc.disk_gb      + (h.local_gb||0),
    disk_used_gb:  acc.disk_used_gb + (h.local_gb_used||0),
    running_vms:   acc.running_vms  + (h.running_vms||0),
  }), { vcpus:0, vcpus_used:0, ram_mb:0, ram_used_mb:0, disk_gb:0, disk_used_gb:0, running_vms:0 });

  const cpuPct  = totals.vcpus    > 0 ? Math.round((totals.vcpus_used/totals.vcpus)*100)      : 0;
  const ramPct  = totals.ram_mb   > 0 ? Math.round((totals.ram_used_mb/totals.ram_mb)*100)    : 0;
  const diskPct = totals.disk_gb  > 0 ? Math.round((totals.disk_used_gb/totals.disk_gb)*100)  : 0;

  const cpuColor  = cpuPct  > 80 ? '#ff4466' : cpuPct  > 60 ? '#ffaa00' : '#00ffcc';
  const ramColor  = ramPct  > 80 ? '#ff4466' : ramPct  > 60 ? '#ffaa00' : '#00aaff';
  const diskColor = diskPct > 80 ? '#ff4466' : diskPct > 60 ? '#ffaa00' : '#00ff88';

  return (
    <div className="page">
      {/* Cluster summary */}
      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
        {[
          { label:'VCPU ALLOCATION',  pct:cpuPct,  color:cpuColor,  sub:`${totals.vcpus_used} / ${totals.vcpus} vCPUs` },
          { label:'RAM ALLOCATION',   pct:ramPct,  color:ramColor,  sub:`${Math.round(totals.ram_used_mb/1024)}GB / ${Math.round(totals.ram_mb/1024)}GB` },
          { label:'DISK ALLOCATION',  pct:diskPct, color:diskColor, sub:`${totals.disk_used_gb}GB / ${totals.disk_gb}GB` },
        ].map(c=>(
          <div key={c.label} className="stat-card" style={{flex:'1 1 180px',display:'flex',flexDirection:'column',alignItems:'center',padding:'20px 14px',gap:8}}>
            <Arc pct={c.pct} color={c.color} size={90} stroke={9} label={c.label} sublabel={c.sub}/>
          </div>
        ))}
        <div className="stat-card" style={{flex:'1 1 120px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px 14px',gap:6}}>
          <div style={{fontSize:36,fontWeight:700,color:'var(--accent)',fontFamily:'var(--font-display)'}}>{totals.running_vms}</div>
          <div style={{fontSize:9,letterSpacing:2,color:'var(--text-dim)'}}>RUNNING VMs</div>
          <div style={{fontSize:10,color:'var(--text-dim)'}}>across {hypervisors.length} hypervisors</div>
          <button className="ui-btn" style={{marginTop:8,fontSize:10,padding:'4px 10px'}} onClick={sample}>{refreshing?'…':'↻ REFRESH'}</button>
        </div>
      </div>

      {/* Per-hypervisor panels */}
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:'var(--text-dim)',marginBottom:12}}>HYPERVISOR BREAKDOWN</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:14,marginBottom:24}}>
        {hypervisors.map((h,i)=>{
          const hCpu  = h.vcpus>0    ? Math.round((h.vcpus_used/h.vcpus)*100)         : 0;
          const hRam  = h.memory_mb>0? Math.round((h.memory_mb_used/h.memory_mb)*100)  : 0;
          const hDisk = h.local_gb>0 ? Math.round((h.local_gb_used/h.local_gb)*100)    : 0;
          const hist  = history[h.id] || [];
          const cpuHist = hist.map(s=>s.cpu_pct);
          const ramHist = hist.map(s=>s.ram_pct);
          const color = COLORS[i % COLORS.length];
          const stateBadge = h.state==='up' ? '#00ff88' : '#ff4466';

          return (
            <div key={h.id} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'14px 16px'}}>
              {/* Hypervisor header */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:stateBadge,display:'inline-block'}}/>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text)',fontWeight:700}}>{h.hypervisor_hostname?.split('.')[0]}</span>
                  </div>
                  <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>{h.hypervisor_type} {h.hypervisor_version} · {h.running_vms} VMs</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10,color:'var(--text-dim)'}}>HOST IP</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:color}}>{h.host_ip||'—'}</div>
                </div>
              </div>

              {/* Bars */}
              <Bar label="vCPU"  used={h.vcpus_used}       total={h.vcpus}      pct={hCpu}  color={hCpu >80?'#ff4466':color}  unit=""/>
              <Bar label="RAM"   used={Math.round(h.memory_mb_used/1024)} total={Math.round(h.memory_mb/1024)} pct={hRam} color={hRam>80?'#ff4466':'#00aaff'} unit="GB"/>
              <Bar label="Disk"  used={h.local_gb_used}    total={h.local_gb}   pct={hDisk} color={hDisk>80?'#ff4466':'#00ff88'} unit="GB"/>

              {/* Sparklines */}
              {hist.length > 2 && (
                <div style={{marginTop:12,display:'flex',gap:16}}>
                  <div>
                    <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:3}}>CPU HISTORY</div>
                    <MiniSparkline data={cpuHist} color={color} width={110} height={32}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:3}}>RAM HISTORY</div>
                    <MiniSparkline data={ramHist} color="#00aaff" width={110} height={32}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tenant usage breakdown */}
      {usageSamples.length > 0 && (
        <>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:'var(--text-dim)',marginBottom:12}}>TENANT USAGE</div>
          <div className="data-table">
            <div className="table-head" style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 100px 100px',padding:'8px 14px',gap:12}}>
              <span>PROJECT ID</span><span>VMs</span><span>vCPU·h</span><span>RAM MB·h</span><span>DISK GB·h</span>
            </div>
            {usageSamples.map((u,i)=>(
              <div key={i} className="table-row" style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 100px 100px',padding:'9px 14px',gap:12,alignItems:'center'}}>
                <div className="cell-mono" style={{fontSize:11}}>{u.tenant_id?.slice(0,24)}…</div>
                <div className="cell-primary">{u.total_instances}</div>
                <div className="cell-dim">{Math.round(u.total_vcpus_usage||0)}</div>
                <div className="cell-dim">{Math.round(u.total_memory_mb_usage||0)}</div>
                <div className="cell-dim">{Math.round(u.total_local_gb_usage||0)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {hypervisors.length===0&&(
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-dim)'}}>
          <div style={{fontSize:32,marginBottom:12}}>⬡</div>
          <div>No hypervisor data. Make sure Nova is healthy.</div>
        </div>
      )}
    </div>
  );
}