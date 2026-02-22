// src/hooks/useStore — global state
import { createContext, useContext, useReducer, useCallback } from "react";
import { compute, network, image, volume, identity } from "../api/openstack.js";

const Ctx = createContext(null);

const init = {
  auth: null,
  servers: [], flavors: [], keypairs: [], quota: null,
  hypervisors: [], azones: [], aggregates: [],
  networks: [], subnets: [], ports: [], routers: [],
  floatingips: [], secgroups: [], agents: [],
  images: [],
  volumes: [], snapshots: [], volumeTypes: [],
  projects: [], users: [],
  loading: {}, errors: {},
  toasts: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_AUTH":   return { ...state, auth: action.payload };
    case "SET":        return { ...state, [action.key]: action.payload };
    case "SET_LOADING":return { ...state, loading: { ...state.loading, [action.key]: action.val } };
    case "ADD_TOAST":  return { ...state, toasts: [...state.toasts, { id: Date.now() + Math.random(), ...action.payload }] };
    case "RM_TOAST":   return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    case "LOGOUT":     return { ...init };
    default:           return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);

  const toast = useCallback((msg, type = "ok") =>
    dispatch({ type: "ADD_TOAST", payload: { msg, type } }), []);
  const rmToast = useCallback((id) =>
    dispatch({ type: "RM_TOAST", id }), []);

  const load = useCallback(async (key, fn) => {
    dispatch({ type: "SET_LOADING", key, val: true });
    try {
      const data = await fn();
      dispatch({ type: "SET", key, payload: data });
    } catch (e) {
      console.error(key, e.message);
    } finally {
      dispatch({ type: "SET_LOADING", key, val: false });
    }
  }, []);

  const refresh = useCallback(async () => {
    const pid = state.auth?.project?.id;
    await Promise.all([
      load("servers",     compute.servers),
      load("flavors",     compute.flavors),
      load("keypairs",    compute.keypairs),
      load("hypervisors", compute.hypervisors),
      load("azones",      compute.azones),
      load("networks",    network.networks),
      load("subnets",     network.subnets),
      load("routers",     network.routers),
      load("floatingips", network.floatingips),
      load("secgroups",   network.secgroups),
      load("agents",      network.agents),
      load("images",      image.list),
      load("volumes",     volume.list),
      load("snapshots",   volume.snapshots),
      load("volumeTypes", volume.volumeTypes),
      ...(pid ? [load("quota", () => compute.quota(pid))] : []),
    ]);
  }, [state.auth, load]);

  const logout = () => dispatch({ type: "LOGOUT" });

  return (
    <Ctx.Provider value={{ state, dispatch, toast, rmToast, load, refresh, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);
