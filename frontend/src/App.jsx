// src/App.jsx — root component
import { useState, useEffect, useCallback } from "react";
import { StoreProvider, useStore } from "./hooks/useStore";
import { setToken } from "./api/client.js";
import { auth as authApi } from "./api/openstack.js";
import { identity, compute as computeApi } from "./api/openstack.js";
import ParticleField from "./components/ParticleField.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { Toast } from "./components/UI.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Compute from "./pages/Compute.jsx";
import NetworkPage from "./pages/Network.jsx";
import Routers from "./pages/Routers.jsx";
import SecurityGroups from "./pages/SecurityGroups.jsx";
import { FloatingIPs, Volumes, Images, KeyPairs, Topology } from "./pages/OtherPages.jsx";
import { Hypervisors, Projects, Users, Endpoints, Quotas } from "./pages/Admin.jsx";

const PAGES = {
  overview: Overview,
  compute: Compute,
  network: NetworkPage,
  routers: Routers,
  secgroups: SecurityGroups,
  floatingips: FloatingIPs,
  volumes: Volumes,
  images: Images,
  keypairs: KeyPairs,
  topology: Topology,
  hypervisors: Hypervisors,
  projects: Projects,
  users: Users,
  endpoints: Endpoints,
  quotas: Quotas,
};

function Dashboard() {
  const { state, dispatch, refresh, load, toast, rmToast } = useStore();
  const [page, setPage] = useState("overview");
  const [lastRefresh, setLastRefresh] = useState(null);

  const doRefresh = useCallback(async () => {
    await refresh();
    // Also load admin data
    load("projects", identity.projects).catch(()=>{});
    load("users", identity.users).catch(()=>{});
    load("services", identity.services).catch(()=>{});
    load("endpoints", identity.endpoints).catch(()=>{});
    setLastRefresh(new Date());
  }, [refresh, load]);

  useEffect(() => {
    if (state.auth) { doRefresh(); }
  }, [state.auth]);

  useEffect(() => {
    const id = setInterval(doRefresh, 30000);
    return () => clearInterval(id);
  }, [doRefresh]);

  const PageComponent = PAGES[page] || Overview;

  return (
    <div className="app-shell">
      <ParticleField />

      {/* Toast container */}
      <div className="toast-container">
        {state.toasts.map(t => (
          <Toast key={t.id} {...t} onClose={() => rmToast(t.id)} />
        ))}
      </div>

      <Sidebar active={page} onChange={setPage} />

      <div className="app-main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-page">{page.toUpperCase().replace("_"," ")}</div>
            {lastRefresh && <div className="topbar-refresh">↻ {lastRefresh.toLocaleTimeString()}</div>}
          </div>
          <div className="topbar-right">
            {state.loading.servers && <div className="loading-dot" />}
            <button className="topbar-btn" onClick={doRefresh}>↻ REFRESH ALL</button>
            <div className="topbar-user">
              <span className="dot active"/>
              <span>{state.auth?.user?.name}</span>
              <span className="topbar-project">| {state.auth?.project?.name}</span>
            </div>
          </div>
        </header>

        <div className="page-container">
          <PageComponent onNavigate={setPage} />
        </div>
      </div>
    </div>
  );
}

function AppInner() {
  const { state, dispatch, toast } = useStore();
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const login = async (form) => {
    setLoginLoading(true); setLoginError("");
    try {
      const d = await authApi.login(form.username, form.password, form.project);
      if (!d.success) throw new Error(d.error || "Authentication failed");
      setToken(d.token);
      dispatch({ type: "SET_AUTH", payload: d });
      toast(`Welcome, ${d.user?.name}!`, "ok");
    } catch (e) {
      setLoginError(e.message);
    }
    setLoginLoading(false);
  };

  if (!state.auth) {
    return <Login onLogin={login} loading={loginLoading} error={loginError} />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  );
}

