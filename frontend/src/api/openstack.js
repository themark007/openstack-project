// src/api/openstack.js — ALL OpenStack API calls (clean, no duplicates)
import { GET, POST, PUT, DEL } from "./client.js";

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const auth = {
  login: (username, password, project) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, project }),
    }).then(r => r.json()),
};

// ── IDENTITY ─────────────────────────────────────────────────────────────────
export const identity = {
  projects:      () => GET("/identity/projects"),
  users:         () => GET("/identity/users"),
  roles:         () => GET("/identity/roles"),
  services:      () => GET("/identity/services"),
  endpoints:     () => GET("/identity/endpoints"),
  createProject: (body) => POST("/identity/projects", body),
  deleteProject: (id)   => DEL(`/identity/projects/${id}`),
  createUser:    (body) => POST("/identity/users", body),
  deleteUser:    (id)   => DEL(`/identity/users/${id}`),
};

// ── COMPUTE (Nova) ────────────────────────────────────────────────────────────
export const compute = {
  servers:       () => GET("/compute/servers"),
  server:        (id) => GET(`/compute/servers/${id}`),
  create:        (body) => POST("/compute/servers", body),
  delete:        (id)   => DEL(`/compute/servers/${id}`),
  action:        (id, body) => POST(`/compute/servers/${id}/action`, body),
  console:       (id)   => POST(`/compute/servers/${id}/console`, {}),
  consoleLog:    (id)   => GET(`/compute/servers/${id}/console-log`),
  serverActions: (id)   => GET(`/compute/servers/${id}/actions`),
  flavors:       () => GET("/compute/flavors"),
  createFlavor:  (body) => POST("/compute/flavors", body),
  deleteFlavor:  (id)   => DEL(`/compute/flavors/${id}`),
  keypairs:      () => GET("/compute/keypairs"),
  createKeypair: (body) => POST("/compute/keypairs", body),
  deleteKeypair: (name) => DEL(`/compute/keypairs/${name}`),
  quota:         (pid)  => GET(`/compute/quota?project_id=${pid || ""}`),
  updateQuota:   (pid, body) => PUT(`/compute/quota/${pid}`, body),
  hypervisors:   () => GET("/compute/hypervisors"),
  azones:        () => GET("/compute/availability-zones"),
  serverGroups:  () => GET("/compute/server-groups"),
  usage:         () => GET("/compute/usage"),
};

// ── NETWORK (Neutron) ─────────────────────────────────────────────────────────
export const network = {
  networks:              () => GET("/network/networks"),
  createNetwork:         (body) => POST("/network/networks", body),
  updateNetwork:         (id, body) => PUT(`/network/networks/${id}`, body),
  deleteNetwork:         (id)   => DEL(`/network/networks/${id}`),
  subnets:               () => GET("/network/subnets"),
  createSubnet:          (body) => POST("/network/subnets", body),
  updateSubnet:          (id, body) => PUT(`/network/subnets/${id}`, body),
  deleteSubnet:          (id)   => DEL(`/network/subnets/${id}`),
  ports:                 (netId) => GET(`/network/ports${netId ? "?network_id=" + netId : ""}`),
  routers:               () => GET("/network/routers"),
  createRouter:          (body) => POST("/network/routers", body),
  updateRouter:          (id, body) => PUT(`/network/routers/${id}`, body),
  deleteRouter:          (id)   => DEL(`/network/routers/${id}`),
  addRouterInterface:    (id, body) => POST(`/network/routers/${id}/interface`, body),
  removeRouterInterface: (id, body) => POST(`/network/routers/${id}/interface/remove`, body),
  floatingips:           () => GET("/network/floatingips"),
  allocateFip:           (body) => POST("/network/floatingips", body),
  associateFip:          (id, body) => PUT(`/network/floatingips/${id}`, body),
  deallocateFip:         (id)   => DEL(`/network/floatingips/${id}`),
  secgroups:             () => GET("/network/security-groups"),
  createSecgroup:        (body) => POST("/network/security-groups", body),
  deleteSecgroup:        (id)   => DEL(`/network/security-groups/${id}`),
  sgRules:               (sgId) => GET(`/network/security-group-rules${sgId ? "?security_group_id=" + sgId : ""}`),
  createSgRule:          (body) => POST("/network/security-group-rules", body),
  deleteSgRule:          (id)   => DEL(`/network/security-group-rules/${id}`),
  agents:                () => GET("/network/agents"),
};

// ── IMAGE (Glance) ────────────────────────────────────────────────────────────
export const image = {
  list:   () => GET("/images"),
  get:    (id)   => GET(`/images/${id}`),
  delete: (id)   => DEL(`/images/${id}`),
  update: (id, body) => PUT(`/images/${id}`, body),
};

// ── VOLUME (Cinder) ───────────────────────────────────────────────────────────
export const volume = {
  list:           () => GET("/volumes"),
  get:            (id)   => GET(`/volumes/${id}`),
  create:         (body) => POST("/volumes", body),
  delete:         (id)   => DEL(`/volumes/${id}`),
  extend:         (id, body) => POST(`/volumes/${id}/action`, body),
  snapshots:      () => GET("/volumes/snapshots"),
  createSnapshot: (body) => POST("/volumes/snapshots", body),
  deleteSnapshot: (id)   => DEL(`/volumes/snapshots/${id}`),
  volumeTypes:    () => GET("/volumes/types"),
  quotas:         (pid)  => GET(`/volumes/quota?project_id=${pid || ""}`),
};

