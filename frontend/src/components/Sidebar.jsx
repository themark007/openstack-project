// src/components/Sidebar.jsx — updated with Magnum, Heat, and UX tools
import { useStore } from "../hooks/useStore.jsx";

const NAV = [
  { id:"overview",    label:"OVERVIEW",      icon:"⬡",  group:"PROJECT" },
  { id:"compute",     label:"INSTANCES",     icon:"⚡",  group:"PROJECT" },
  { id:"volumes",     label:"VOLUMES",       icon:"◉",  group:"PROJECT" },
  { id:"images",      label:"IMAGES",        icon:"◈",  group:"PROJECT" },
  { id:"keypairs",    label:"KEY PAIRS",     icon:"⚿",  group:"PROJECT" },
  { id:"network",     label:"NETWORKS",      icon:"◎",  group:"NETWORK" },
  { id:"routers",     label:"ROUTERS",       icon:"⬟",  group:"NETWORK" },
  { id:"secgroups",   label:"SECURITY GRP",  icon:"⬢",  group:"NETWORK" },
  { id:"floatingips", label:"FLOATING IPs",  icon:"◆",  group:"NETWORK" },
  { id:"topology",    label:"TOPOLOGY",      icon:"⋈",  group:"NETWORK" },
  { id:"magnum",      label:"KUBERNETES",    icon:"⎈",  group:"ORCHESTRATION" },
  { id:"heat",        label:"HEAT STACKS",   icon:"◈",  group:"ORCHESTRATION" },
  { id:"hypervisors", label:"HYPERVISORS",   icon:"⬡",  group:"ADMIN" },
  { id:"projects",    label:"PROJECTS",      icon:"▣",  group:"ADMIN" },
  { id:"users",       label:"USERS",         icon:"◑",  group:"ADMIN" },
  { id:"endpoints",   label:"API ENDPOINTS", icon:"⋮",  group:"ADMIN" },
  { id:"quotas",      label:"QUOTAS",        icon:"▥",  group:"ADMIN" },
];

const GROUPS = ["PROJECT","NETWORK","ORCHESTRATION","ADMIN"];

export default function Sidebar({ active, onChange, onOpenSearch, onOpenCost }) {
  const { state, logout } = useStore();
  const counts = {
    compute:     state.servers.length,
    network:     state.networks.length,
    volumes:     state.volumes.length,
    floatingips: state.floatingips.length,
    secgroups:   state.secgroups.length,
    images:      state.images.length,
    keypairs:    state.keypairs.length,
    routers:     state.routers.length,
    hypervisors: state.hypervisors.length,
    projects:    state.projects.length,
    users:       state.users.length,
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-orb">
          <div className="orb-ring r1"/><div className="orb-ring r2"/><div className="orb-ring r3"/>
          <span className="orb-text">SS</span>
        </div>
        <div className="logo-text">
          <span>SERVER &</span>
          <strong>SUFFER</strong>
          <small>OpenStack Yoga</small>
        </div>
      </div>

      {/* Quick actions bar */}
      <div className="sidebar-quick">
        <button className="quick-btn" onClick={onOpenSearch} title="Quick Search (Ctrl+K)">⌕ Search</button>
        <button className="quick-btn" onClick={onOpenCost}   title="Cost Estimator">$ Cost</button>
      </div>

      {/* Project badge */}
      <div className="project-badge">
        <span className="dot active"/>
        <div>
          <div className="project-name">{state.auth?.project?.name||"—"}</div>
          <div className="project-sub">Active Project</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {GROUPS.map(group=>(
          <div key={group} className="nav-group">
            <div className="nav-group-label">{group}</div>
            {NAV.filter(n=>n.group===group).map(n=>(
              <button key={n.id} className={`nav-item ${active===n.id?"active":""}`} onClick={()=>onChange(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-label">{n.label}</span>
                {counts[n.id]!==undefined&&<span className="nav-badge">{counts[n.id]}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="conn-info">
          <span className="dot active"/>
          <div>
            <div className="conn-host">192.168.61.150</div>
            <div className="conn-sub">VMware · Yoga</div>
          </div>
        </div>
        <div className="user-row">
          <span className="user-icon">◎</span>
          <span className="user-name">{state.auth?.user?.name}</span>
          <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
        </div>
      </div>
    </aside>
  );
}
