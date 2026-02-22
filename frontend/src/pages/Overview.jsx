// src/pages/Overview.jsx
import { useStore } from "../hooks/useStore";
import { StatCard } from "../components/UI.jsx";

const statusColor = (s = "") => {
  const m = { ACTIVE:"#00ff88", SHUTOFF:"#ff4466", BUILD:"#ffaa00", ERROR:"#ff0055", PAUSED:"#8888ff", SUSPENDED:"#ff6600" };
  return m[s.toUpperCase()] || "#888";
};

export default function Overview({ onNavigate }) {
  const { state } = useStore();
  const { servers, networks, volumes, images, routers, floatingips, quota, agents, hypervisors } = state;
  const active = servers.filter(s => s.status === "ACTIVE").length;
  const statusCounts = servers.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), {});
  const usedFips = floatingips.filter(f => f.fixed_ip_address).length;

  return (
    <div className="page overview-page">
      <div className="page-header">
        <h2 className="page-title">PROJECT OVERVIEW</h2>
        <div className="page-meta">{state.auth?.project?.name} · {new Date().toLocaleString()}</div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard label="INSTANCES" value={servers.length} sub={`${active} running`} color="#00ffcc" icon="⚡" onClick={() => onNavigate("compute")} />
        <StatCard label="vCPUs USED" value={quota?.cores?.in_use ?? "—"} sub={`of ${quota?.cores?.limit ?? "∞"}`} color="#00aaff" icon="◎" />
        <StatCard label="RAM USED" value={quota?.ram?.in_use ? `${Math.round(quota.ram.in_use/1024)}GB` : "—"} sub={`of ${quota?.ram?.limit ? Math.round(quota.ram.limit/1024)+"GB" : "∞"}`} color="#aa44ff" icon="⬡" />
        <StatCard label="NETWORKS" value={networks.length} color="#00aaff" icon="◈" onClick={() => onNavigate("network")} />
        <StatCard label="VOLUMES" value={volumes.length} sub={`${volumes.filter(v=>v.status==="available").length} available`} color="#ffaa00" icon="◉" onClick={() => onNavigate("volumes")} />
        <StatCard label="IMAGES" value={images.length} color="#aa44ff" icon="◈" onClick={() => onNavigate("images")} />
        <StatCard label="FLOATING IPs" value={floatingips.length} sub={`${usedFips} in use`} color="#ff4466" icon="◆" onClick={() => onNavigate("floatingips")} />
        <StatCard label="ROUTERS" value={routers.length} color="#ff8800" icon="⬟" onClick={() => onNavigate("routers")} />
      </div>

      {/* Main Grid */}
      <div className="overview-grid">

        {/* Instance Status */}
        <div className="ov-panel">
          <div className="panel-head">INSTANCE STATUS</div>
          <div className="status-bars">
            {Object.entries(statusCounts).map(([st, cnt]) => (
              <div key={st} className="sbar-row">
                <span className="sbar-label" style={{ color: statusColor(st) }}>{st}</span>
                <div className="sbar-track">
                  <div className="sbar-fill" style={{ width: `${(cnt/servers.length)*100}%`, background: statusColor(st) }} />
                </div>
                <span className="sbar-count">{cnt}</span>
              </div>
            ))}
            {servers.length === 0 && <div className="ov-empty">No instances</div>}
          </div>
        </div>

        {/* Recent Instances */}
        <div className="ov-panel">
          <div className="panel-head">RECENT INSTANCES</div>
          {servers.slice(0, 8).map(s => (
            <div key={s.id} className="ov-row">
              <span className="ov-dot" style={{ background: statusColor(s.status), boxShadow: `0 0 5px ${statusColor(s.status)}` }} />
              <span className="ov-name">{s.name}</span>
              <span className="ov-status" style={{ color: statusColor(s.status) }}>{s.status}</span>
            </div>
          ))}
          {servers.length === 0 && <div className="ov-empty">No instances running</div>}
        </div>

        {/* Controller info */}
        <div className="ov-panel">
          <div className="panel-head">CONTROLLER SERVICES</div>
          <div className="ctrl-node">
            <div className="ctrl-pulse" /><span>CONTROLLER</span><small>192.168.61.150</small>
          </div>
          <div className="ctrl-services">
            {[["KEYSTONE",":5000"],["NOVA",":8774"],["NEUTRON",":9696"],["GLANCE",":9292"],["CINDER",":8776"]].map(([s,p])=>(
              <div key={s} className="ctrl-svc">
                <div className="ctrl-line" /><span>{s}</span><span className="ctrl-port">{p}</span>
                <span className="ctrl-ok">●</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hypervisors */}
        <div className="ov-panel">
          <div className="panel-head">HYPERVISOR SUMMARY</div>
          {hypervisors.length === 0 && <div className="ov-empty">No hypervisor data</div>}
          {hypervisors.map(h => (
            <div key={h.id} className="hv-row">
              <div className="hv-name">{h.hypervisor_hostname?.split(".")[0]}</div>
              <div className="hv-bars">
                <div className="hv-bar-label"><span>CPU</span><span>{h.vcpus_used}/{h.vcpus}</span></div>
                <div className="hv-track"><div className="hv-fill cpu" style={{ width:`${h.vcpus>0?(h.vcpus_used/h.vcpus)*100:0}%` }}/></div>
                <div className="hv-bar-label"><span>RAM</span><span>{Math.round((h.memory_mb_used||0)/1024)}/{Math.round((h.memory_mb||0)/1024)}GB</span></div>
                <div className="hv-track"><div className="hv-fill ram" style={{ width:`${h.memory_mb>0?(h.memory_mb_used/h.memory_mb)*100:0}%` }}/></div>
              </div>
            </div>
          ))}
        </div>

        {/* Network Agents */}
        <div className="ov-panel">
          <div className="panel-head">NETWORK AGENTS</div>
          {agents.slice(0, 8).map(a => (
            <div key={a.id} className="ov-row">
              <span className="ov-dot" style={{ background: a.alive ? "#00ff88" : "#ff4466", boxShadow: `0 0 5px ${a.alive?"#00ff88":"#ff4466"}` }} />
              <span className="ov-name">{a.binary}</span>
              <span className="ov-status" style={{ color: a.alive ? "#00ff88" : "#ff4466" }}>{a.alive ? "UP" : "DOWN"}</span>
            </div>
          ))}
          {agents.length === 0 && <div className="ov-empty">No agent data</div>}
        </div>

        {/* Quota */}
        <div className="ov-panel">
          <div className="panel-head">QUOTA OVERVIEW</div>
          {quota ? (
            <div className="quota-list">
              {[
                ["Instances", quota.instances],
                ["vCPUs", quota.cores],
                ["RAM (GB)", { in_use: Math.round((quota.ram?.in_use||0)/1024), limit: Math.round((quota.ram?.limit||0)/1024) }],
                ["Key Pairs", quota.key_pairs],
                ["Security Groups", quota.security_groups],
              ].map(([label, q]) => q && (
                <div key={label} className="quota-row">
                  <span className="quota-label">{label}</span>
                  <div className="quota-track">
                    <div className="quota-fill" style={{ width: `${q.limit>0?Math.min((q.in_use/q.limit)*100,100):0}%` }} />
                  </div>
                  <span className="quota-nums">{q.in_use ?? 0}/{q.limit ?? "∞"}</span>
                </div>
              ))}
            </div>
          ) : <div className="ov-empty">Loading quota…</div>}
        </div>

      </div>
    </div>
  );
}

