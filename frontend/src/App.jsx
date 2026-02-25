// src/App.jsx — v2.3
import { useState, useEffect, useCallback } from "react";
import { StoreProvider, useStore } from "./hooks/useStore";
import { ThemeProvider } from "./hooks/useTheme";
import { setToken } from "./api/client.js";
import { auth as authApi, identity, compute as computeApi } from "./api/openstack.js";
import ParticleField from "./components/ParticleField.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { Toast } from "./components/UI.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Compute from "./pages/Compute.jsx";
import NetworkPage from "./pages/Network.jsx";
import Routers from "./pages/Routers.jsx";
import SecurityGroupBuilder from "./pages/SecurityGroupBuilder.jsx";
import { FloatingIPs, Volumes, Images, KeyPairs } from "./pages/OtherPages.jsx";
import { Hypervisors, Projects, Users, Endpoints, Quotas } from "./pages/Admin.jsx";
import Magnum from "./pages/Magnum.jsx";
import Heat from "./pages/Heat.jsx";
import RoleAssignment from "./pages/RoleAssignment.jsx";
import ResourceCharts from "./pages/ResourceCharts.jsx";
import TopologyV2 from "./pages/TopologyV2.jsx";
import { CommandPalette, CostEstimator, useCommandPalette } from "./pages/UXFeatures.jsx";

const PAGES = {
  overview: Overview, compute: Compute, network: NetworkPage,
  routers: Routers, sgbuilder: SecurityGroupBuilder, floatingips: FloatingIPs,
  volumes: Volumes, images: Images, keypairs: KeyPairs, topology: TopologyV2,
  hypervisors: Hypervisors, projects: Projects, users: Users,
  endpoints: Endpoints, quotas: Quotas, magnum: Magnum, heat: Heat,
  roles: RoleAssignment, resources: ResourceCharts,
};

function Dashboard() {
  const { state, refresh, load, toast, rmToast } = useStore();
  const [page, setPage]           = useState("overview");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showCost, setShowCost]   = useState(false);
  const { open:cmdOpen, open_:openCmd, close_:closeCmd } = useCommandPalette();

  const doRefresh = useCallback(async () => {
    await refresh();
    load("projects",  identity.projects).catch(()=>{});
    load("users",     identity.users).catch(()=>{});
    load("services",  identity.services).catch(()=>{});
    load("endpoints", identity.endpoints).catch(()=>{});
    setLastRefresh(new Date());
  }, [refresh, load]);

  useEffect(()=>{ if (state.auth) doRefresh(); },[state.auth]);
  useEffect(()=>{ const id=setInterval(doRefresh,30000); return()=>clearInterval(id); },[doRefresh]);

  const PageComponent = PAGES[page] || Overview;

  return (
    <div className="app-shell">
      <ParticleField />
      <div className="toast-container">
        {state.toasts.map(t=><Toast key={t.id} {...t} onClose={()=>rmToast(t.id)}/>)}
      </div>
      {cmdOpen  && <CommandPalette onClose={closeCmd} onNavigate={p=>{setPage(p);closeCmd();}}/>}
      {showCost && <CostEstimator onClose={()=>setShowCost(false)}/>}
      <Sidebar active={page} onChange={setPage} onOpenSearch={openCmd} onOpenCost={()=>setShowCost(true)}/>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-page">{page.toUpperCase().replace(/_/g," ")}</div>
            {lastRefresh&&<div className="topbar-refresh">↻ {lastRefresh.toLocaleTimeString()}</div>}
          </div>
          <div className="topbar-right">
            {(state.loading?.servers||state.loading?.networks)&&<div className="loading-dot"/>}
            <button className="topbar-btn" onClick={openCmd} title="Ctrl+K">⌕ SEARCH</button>
            <button className="topbar-btn" onClick={()=>setShowCost(true)}>$ COST</button>
            <button className="topbar-btn" onClick={doRefresh}>↻ REFRESH</button>
            <div className="topbar-user">
              <span className="dot active"/>
              <span>{state.auth?.user?.name}</span>
              <span className="topbar-project">| {state.auth?.project?.name}</span>
            </div>
          </div>
        </header>
        <div className="page-container">
          <PageComponent onNavigate={setPage}/>
        </div>
      </div>
    </div>
  );
}

function AppInner() {
  const { state, dispatch, toast } = useStore();
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError,   setLoginError]   = useState("");
  const login = async (form) => {
    setLoginLoading(true); setLoginError("");
    try {
      const d = await authApi.login(form.username, form.password, form.project);
      if (!d.success) throw new Error(d.error || "Authentication failed");
      setToken(d.token);
      dispatch({ type:"SET_AUTH", payload:d });
      toast(`Welcome, ${d.user?.name}!`,"ok");
    } catch(e) { setLoginError(e.message); }
    setLoginLoading(false);
  };
  if (!state.auth) return <Login onLogin={login} loading={loginLoading} error={loginError}/>;
  return <Dashboard/>;
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider><AppInner/></StoreProvider>
    </ThemeProvider>
  );
}