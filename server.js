const express  = require('express');
const axios    = require('axios');
const cors     = require('cors');
const http     = require('http');
const { WebSocketServer } = require('ws');
const { Client: SSHClient } = require('ssh2');

const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: '*', exposedHeaders: ['X-Auth-Token'] }));
app.use(express.json({ limit: '10mb' }));

const OS = 'http://192.168.61.150';
const P  = { keystone:5000, nova:8774, neutron:9696, glance:9292, cinder:8776, magnum:9511, heat:8004 };

const novaH = (tk) => ({ 'X-Auth-Token':tk, 'Content-Type':'application/json', 'X-OpenStack-Nova-Microversion':'2.72' });
const defH  = (tk) => ({ 'X-Auth-Token':tk, 'Content-Type':'application/json' });

// ── Token store — saved at login, also accepted per-request ───────────────────
let _token     = null;
let _projectId = null;
const getToken = (req) => req.headers['x-auth-token'] || _token;

// ── Safe proxy wrapper — always returns JSON, gracefully handles connection errors ─
const proxied = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    res.json(result ?? []);
  } catch (e) {
    const status = e.response?.status || 500;
    const data   = e.response?.data;
    let msg = e.message;
    if (data) {
      if (typeof data === 'string' && data.includes('<html')) msg = `OpenStack service error (${status})`;
      else msg = data?.error?.message || data?.message || JSON.stringify(data);
    }
    console.error(`[${status}] ${req.method} ${req.path} → ${msg}`);
    res.status(status).json({ error: msg });
  }
};

// ── Safe fetch — returns fallback value on ECONNREFUSED / service unavailable ─
const safeFetch = async (fetchFn, fallback = []) => {
  try { return await fetchFn(); }
  catch (e) {
    if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.response?.status >= 500) {
      console.warn(`Service unavailable: ${e.message}`);
      return fallback;
    }
    throw e;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SSH WebSocket
// ─────────────────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  let ssh = null; let stream = null;
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'connect') {
        ssh = new SSHClient();
        ssh.on('ready', () => {
          ws.send(JSON.stringify({ type:'status', data:'CONNECTED' }));
          ssh.shell({ term:'xterm-256color', cols:msg.cols||220, rows:msg.rows||50 }, (err, s) => {
            if (err) { ws.send(JSON.stringify({ type:'error', data:err.message })); return; }
            stream = s;
            s.on('data',        d => ws.send(JSON.stringify({ type:'data', data:d.toString('binary') })));
            s.stderr.on('data', d => ws.send(JSON.stringify({ type:'data', data:d.toString('binary') })));
            s.on('close', () => { ws.send(JSON.stringify({ type:'status', data:'DISCONNECTED' })); ws.close(); });
          });
        });
        ssh.on('error', (e) => ws.send(JSON.stringify({ type:'error', data:e.message })));
        ssh.connect({
          host: msg.host, port: msg.port||22, username: msg.username, readyTimeout: 12000,
          ...(msg.password   && { password: msg.password }),
          ...(msg.privateKey && { privateKey: Buffer.from(msg.privateKey) }),
          hostVerifier: () => true,
        });
      } else if (msg.type==='data'   && stream) { stream.write(msg.data); }
        else if (msg.type==='resize'  && stream) { stream.setWindow(msg.rows, msg.cols, 0, 0); }
    } catch(e) { console.error('SSH ws error:', e.message); }
  });
  ws.on('close', () => { try { if(ssh) ssh.end(); } catch(_){} });
  ws.on('error', () => { try { if(ssh) ssh.end(); } catch(_){} });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/ssh') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  else socket.destroy();
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (_,res) => res.json({ status:'online', controller:'192.168.61.150', time:new Date(), projectId:_projectId }));

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — stores token + projectId server-side so all subsequent calls work
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password, project } = req.body;
  try {
    const r = await axios.post(`${OS}:${P.keystone}/v3/auth/tokens`, {
      auth: {
        identity: { methods:['password'], password:{ user:{ name:username, domain:{name:'Default'}, password } } },
        scope:    { project:{ name:project||'admin', domain:{name:'Default'} } },
      }
    });
    _token     = r.headers['x-subject-token'];
    _projectId = r.data.token.project?.id;
    console.log(`✓ Auth OK — user:${username} project:${project} pid:${_projectId}`);
    res.json({
      success:true, token:_token,
      project:r.data.token.project, user:r.data.token.user,
      catalog:r.data.token.catalog, expires_at:r.data.token.expires_at,
    });
  } catch(e) {
    console.error('Auth failed:', e.response?.data?.error?.message || e.message);
    res.status(401).json({ success:false, error:e.response?.data?.error?.message||'Authentication failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/identity/projects',  proxied(async r => (await axios.get(`${OS}:${P.keystone}/v3/projects`,  {headers:defH(getToken(r))})).data.projects));
app.get('/api/identity/users',     proxied(async r => (await axios.get(`${OS}:${P.keystone}/v3/users`,     {headers:defH(getToken(r))})).data.users));
app.get('/api/identity/roles',     proxied(async r => (await axios.get(`${OS}:${P.keystone}/v3/roles`,     {headers:defH(getToken(r))})).data.roles));
app.get('/api/identity/services',  proxied(async r => (await axios.get(`${OS}:${P.keystone}/v3/services`,  {headers:defH(getToken(r))})).data.services));
app.get('/api/identity/endpoints', proxied(async r => (await axios.get(`${OS}:${P.keystone}/v3/endpoints`, {headers:defH(getToken(r))})).data.endpoints));
app.post('/api/identity/projects', proxied(async r => (await axios.post(`${OS}:${P.keystone}/v3/projects`, r.body, {headers:defH(getToken(r))})).data.project));
app.delete('/api/identity/projects/:id', proxied(async r => { await axios.delete(`${OS}:${P.keystone}/v3/projects/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.post('/api/identity/users',    proxied(async r => (await axios.post(`${OS}:${P.keystone}/v3/users`, r.body, {headers:defH(getToken(r))})).data.user));
app.delete('/api/identity/users/:id', proxied(async r => { await axios.delete(`${OS}:${P.keystone}/v3/users/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));

// ─────────────────────────────────────────────────────────────────────────────
// NOVA — COMPUTE
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/compute/servers', proxied(async r => {
  const tk = getToken(r);
  if (!tk) return [];
  try {
    // Try with full detail (preferred)
    const res = await axios.get(`${OS}:${P.nova}/v2.1/servers/detail`, {headers:novaH(tk)});
    return res.data.servers || [];
  } catch(e) {
    // If TypeError/500 from Nova, retry with lower microversion
    if (e.response?.status === 500) {
      console.warn('Nova detail failed with 2.72, retrying with 2.1...');
      const h = { 'X-Auth-Token':tk, 'Content-Type':'application/json' };
      const res2 = await axios.get(`${OS}:${P.nova}/v2.1/servers/detail`, {headers:h});
      return res2.data.servers || [];
    }
    throw e;
  }
}));
app.post('/api/compute/servers', proxied(async r => {
  const { name, imageRef, flavorRef, networks, key_name, security_groups, user_data, availability_zone } = r.body;
  const body = { server: {
    name, imageRef, flavorRef,
    networks: (networks && networks.length > 0) ? networks : 'auto',
    ...(key_name         && { key_name }),
    ...(security_groups  && { security_groups: security_groups.map(s => ({ name:s })) }),
    ...(user_data        && { user_data }),
    ...(availability_zone && { availability_zone }),
  }};
  return (await axios.post(`${OS}:${P.nova}/v2.1/servers`, body, {headers:novaH(getToken(r))})).data.server;
}));
app.post('/api/compute/servers/:id/action', proxied(async r => {
  const x = await axios.post(`${OS}:${P.nova}/v2.1/servers/${r.params.id}/action`, r.body, {headers:novaH(getToken(r))});
  return { success:true, data:x.data||null };
}));
app.delete('/api/compute/servers/:id', proxied(async r => {
  await axios.delete(`${OS}:${P.nova}/v2.1/servers/${r.params.id}`, {headers:novaH(getToken(r))});
  return { success:true };
}));
app.get('/api/compute/servers/:id/console-log', proxied(async r => {
  const x = await axios.post(`${OS}:${P.nova}/v2.1/servers/${r.params.id}/action`,
    {'os-getConsoleOutput':{length:150}}, {headers:novaH(getToken(r))});
  return { output: x.data.output };
}));
app.post('/api/compute/servers/:id/console', proxied(async r =>
  (await axios.post(`${OS}:${P.nova}/v2.1/servers/${r.params.id}/remote-consoles`,
    {remote_console:{protocol:'vnc',type:'novnc'}}, {headers:novaH(getToken(r))})).data.remote_console
));
app.get('/api/compute/servers/:id/actions', proxied(async r =>
  (await axios.get(`${OS}:${P.nova}/v2.1/servers/${r.params.id}/os-instance-actions`, {headers:novaH(getToken(r))})).data.instanceActions
));
app.get('/api/compute/flavors', proxied(async r => {
  const tk = getToken(r);
  if (!tk) return [];
  try {
    return (await axios.get(`${OS}:${P.nova}/v2.1/flavors/detail`, {headers:novaH(tk)})).data.flavors || [];
  } catch(e) {
    if (e.response?.status === 500) {
      const h = { 'X-Auth-Token':tk, 'Content-Type':'application/json' };
      return (await axios.get(`${OS}:${P.nova}/v2.1/flavors/detail`, {headers:h})).data.flavors || [];
    }
    throw e;
  }
}));
// ══════════════════════════════════════════════════════════════════════════════
// ADD THESE ROUTES TO server.js  (paste before the final server.listen line)
// ══════════════════════════════════════════════════════════════════════════════

// ── Security Group Rules ──────────────────────────────────────────────────────
app.get('/api/network/security-group-rules', proxied(async r => {
  const sgId = r.query.security_group_id;
  const qs   = sgId ? `?security_group_id=${sgId}` : '';
  return (await axios.get(`${OS}:${P.neutron}/v2.0/security-group-rules${qs}`, {headers:defH(getToken(r))})).data.security_group_rules;
}));

app.post('/api/network/security-group-rules', proxied(async r => {
  const res = await axios.post(`${OS}:${P.neutron}/v2.0/security-group-rules`,
    { security_group_rule: r.body }, {headers:defH(getToken(r))});
  return res.data.security_group_rule;
}));

app.delete('/api/network/security-group-rules/:id', proxied(async r => {
  await axios.delete(`${OS}:${P.neutron}/v2.0/security-group-rules/${r.params.id}`, {headers:defH(getToken(r))});
  return { success: true };
}));

// ── Resize / Confirm / Revert ──────────────────────────────────────────────────
// These go through the existing /api/compute/servers/:id/action route — no new routes needed.
// Resize: POST /api/compute/servers/:id/action  { resize: { flavorRef: "FLAVOR_ID" } }
// Confirm: POST /api/compute/servers/:id/action { confirmResize: null }
// Revert:  POST /api/compute/servers/:id/action { revertResize: null }

// ── Ports by device_id (for auto floating IP) ─────────────────────────────────
app.get('/api/network/ports', proxied(async r => {
  const device_id = r.query.device_id;
  const qs = device_id ? `?device_id=${device_id}` : '';
  return (await axios.get(`${OS}:${P.neutron}/v2.0/ports${qs}`, {headers:defH(getToken(r))})).data.ports;
}));

// ── Network resource PUT (edit from topology) ─────────────────────────────────
app.put('/api/network/networks/:id', proxied(async r => {
  const res = await axios.put(`${OS}:${P.neutron}/v2.0/networks/${r.params.id}`,
    { network: r.body }, {headers:defH(getToken(r))});
  return res.data.network;
}));

app.put('/api/network/routers/:id', proxied(async r => {
  const res = await axios.put(`${OS}:${P.neutron}/v2.0/routers/${r.params.id}`,
    { router: r.body }, {headers:defH(getToken(r))});
  return res.data.router;
}));

app.put('/api/network/subnets/:id', proxied(async r => {
  const res = await axios.put(`${OS}:${P.neutron}/v2.0/subnets/${r.params.id}`,
    { subnet: r.body }, {headers:defH(getToken(r))});
  return res.data.subnet;
}));

app.delete('/api/network/networks/:id', proxied(async r => {
  await axios.delete(`${OS}:${P.neutron}/v2.0/networks/${r.params.id}`, {headers:defH(getToken(r))});
  return { success: true };
}));

app.delete('/api/network/routers/:id', proxied(async r => {
  await axios.delete(`${OS}:${P.neutron}/v2.0/routers/${r.params.id}`, {headers:defH(getToken(r))});
  return { success: true };
}));

app.delete('/api/network/subnets/:id', proxied(async r => {
  await axios.delete(`${OS}:${P.neutron}/v2.0/subnets/${r.params.id}`, {headers:defH(getToken(r))});
  return { success: true };
}));

// ── Floating IP allocate + associate (for auto-FIP) ───────────────────────────
// POST /api/network/floatingips  { floating_network_id: "..." }
// PUT  /api/network/floatingips/:id  { port_id: "..." }

// floatingips GET/POST already exist. Add PUT:
app.put('/api/network/floatingips/:id', proxied(async r => {
  const res = await axios.put(`${OS}:${P.neutron}/v2.0/floatingips/${r.params.id}`,
    { floatingip: r.body }, {headers:defH(getToken(r))});
  return res.data.floatingip;
}));

// ── Subnets list (needed for topology) ────────────────────────────────────────
app.get('/api/network/subnets', proxied(async r => {
  return (await axios.get(`${OS}:${P.neutron}/v2.0/subnets`, {headers:defH(getToken(r))})).data.subnets;
}));

// ── Console output action ─────────────────────────────────────────────────────
// Already handled via /api/compute/servers/:id/action — no change needed.

// ── Compute tenant usage (for resource charts) ────────────────────────────────
app.get('/api/compute/usage', proxied(async r => {
  const tk = getToken(r);
  if (!tk) return {};
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end   = now.toISOString().split('T')[0];
    const res = await axios.get(
      `${OS}:${P.nova}/v2.1/os-simple-tenant-usage?detailed=1&start=${start}&end=${end}`,
      {headers:novaH(tk,null)}
    );
    return res.data;
  } catch(e) { return {}; }
}));

// ── Server security group add/remove ──────────────────────────────────────────
// Handled by existing /api/compute/servers/:id/action with body:
// { addSecurityGroup: { name: "sgname" } }
// { removeSecurityGroup: { name: "sgname" } }
app.post('/api/compute/flavors',      proxied(async r => (await axios.post(`${OS}:${P.nova}/v2.1/flavors`, r.body, {headers:novaH(getToken(r))})).data.flavor));
app.delete('/api/compute/flavors/:id',proxied(async r => { await axios.delete(`${OS}:${P.nova}/v2.1/flavors/${r.params.id}`,{headers:novaH(getToken(r))}); return {success:true}; }));
app.get('/api/compute/keypairs',      proxied(async r => (await axios.get(`${OS}:${P.nova}/v2.1/os-keypairs`,{headers:novaH(getToken(r))})).data.keypairs));
app.post('/api/compute/keypairs',     proxied(async r => (await axios.post(`${OS}:${P.nova}/v2.1/os-keypairs`,r.body,{headers:novaH(getToken(r))})).data));
app.delete('/api/compute/keypairs/:name', proxied(async r => { await axios.delete(`${OS}:${P.nova}/v2.1/os-keypairs/${r.params.name}`,{headers:novaH(getToken(r))}); return {success:true}; }));
app.get('/api/compute/quota', proxied(async r => {
  const pid = r.query.project_id || _projectId;
  if (!pid) return {};
  return (await axios.get(`${OS}:${P.nova}/v2.1/os-quota-sets/${pid}?usage=true`, {headers:novaH(getToken(r))})).data.quota_set;
}));
// ── ADD THESE ROUTES TO server.js (before the PORT line) ─────────────────────

// ── ROLE ASSIGNMENTS ──────────────────────────────────────────────────────────
app.get('/api/identity/role-assignments', proxied(async r => {
  const res = await axios.get(`${OS}:${P.keystone}/v3/role_assignments?include_names=true`, {headers:defH(getToken(r))});
  return res.data.role_assignments || [];
}));

app.post('/api/identity/role-assignments', proxied(async r => {
  const { user_id, project_id, role_id } = r.body;
  if (!user_id||!project_id||!role_id) throw new Error('user_id, project_id, role_id required');
  await axios.put(
    `${OS}:${P.keystone}/v3/projects/${project_id}/users/${user_id}/roles/${role_id}`,
    {}, {headers:defH(getToken(r))}
  );
  return { success:true };
}));

app.delete('/api/identity/role-assignments', proxied(async r => {
  const { user_id, project_id, role_id } = r.query;
  if (!user_id||!project_id||!role_id) throw new Error('user_id, project_id, role_id required');
  await axios.delete(
    `${OS}:${P.keystone}/v3/projects/${project_id}/users/${user_id}/roles/${role_id}`,
    {headers:defH(getToken(r))}
  );
  return { success:true };
}));

// ── NETWORK PORTS (needed for auto-FIP association) ───────────────────────────
// Already exists but add device_id filter support
app.get('/api/network/ports/by-device', proxied(async r => {
  const { device_id } = r.query;
  const qs = device_id ? `?device_id=${device_id}` : '';
  return (await axios.get(`${OS}:${P.neutron}/v2.0/ports${qs}`, {headers:defH(getToken(r))})).data.ports;
}));
app.put('/api/compute/quota/:pid',        proxied(async r => (await axios.put(`${OS}:${P.nova}/v2.1/os-quota-sets/${r.params.pid}`, r.body, {headers:novaH(getToken(r))})).data.quota_set));
app.get('/api/compute/hypervisors',       proxied(async r => (await axios.get(`${OS}:${P.nova}/v2.1/os-hypervisors/detail`,{headers:novaH(getToken(r))})).data.hypervisors));
app.get('/api/compute/availability-zones',proxied(async r => (await axios.get(`${OS}:${P.nova}/v2.1/os-availability-zone/detail`,{headers:novaH(getToken(r))})).data.availabilityZoneInfo));
app.get('/api/compute/server-groups',     proxied(async r => (await axios.get(`${OS}:${P.nova}/v2.1/os-server-groups`,{headers:novaH(getToken(r))})).data.server_groups));
app.get('/api/compute/usage',             proxied(async r => (await axios.get(`${OS}:${P.nova}/v2.1/os-simple-tenant-usage`,{headers:novaH(getToken(r))})).data));

// ─────────────────────────────────────────────────────────────────────────────
// NEUTRON — NETWORK
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/network/networks', proxied(async r => (await axios.get(`${OS}:${P.neutron}/v2.0/networks`,{headers:defH(getToken(r))})).data.networks));
app.post('/api/network/networks', proxied(async r => {
  const { name, admin_state_up=true, shared=false, external=false, cidr, subnet_name, ip_version=4, enable_dhcp=true, dns_nameservers=[] } = r.body;
  const t = getToken(r);
  const net = (await axios.post(`${OS}:${P.neutron}/v2.0/networks`,
    {network:{name,admin_state_up,shared,...(external&&{'router:external':true})}},{headers:defH(t)})).data.network;
  let subnet = null;
  if (cidr) subnet = (await axios.post(`${OS}:${P.neutron}/v2.0/subnets`,
    {subnet:{network_id:net.id,name:subnet_name||`${name}-subnet`,cidr,ip_version,enable_dhcp,...(dns_nameservers.length&&{dns_nameservers})}},{headers:defH(t)})).data.subnet;
  return { network:net, subnet };
}));
app.put('/api/network/networks/:id',     proxied(async r => (await axios.put(`${OS}:${P.neutron}/v2.0/networks/${r.params.id}`,{network:r.body},{headers:defH(getToken(r))})).data.network));
app.delete('/api/network/networks/:id',  proxied(async r => { await axios.delete(`${OS}:${P.neutron}/v2.0/networks/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.get('/api/network/subnets',          proxied(async r => (await axios.get(`${OS}:${P.neutron}/v2.0/subnets`,{headers:defH(getToken(r))})).data.subnets));
app.post('/api/network/subnets',         proxied(async r => (await axios.post(`${OS}:${P.neutron}/v2.0/subnets`,{subnet:r.body},{headers:defH(getToken(r))})).data.subnet));
app.put('/api/network/subnets/:id',      proxied(async r => (await axios.put(`${OS}:${P.neutron}/v2.0/subnets/${r.params.id}`,{subnet:r.body},{headers:defH(getToken(r))})).data.subnet));
app.delete('/api/network/subnets/:id',   proxied(async r => { await axios.delete(`${OS}:${P.neutron}/v2.0/subnets/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.get('/api/network/ports', proxied(async r => {
  const qs = r.query.network_id ? `?network_id=${r.query.network_id}` : '';
  return (await axios.get(`${OS}:${P.neutron}/v2.0/ports${qs}`,{headers:defH(getToken(r))})).data.ports;
}));
app.get('/api/network/routers',          proxied(async r => (await axios.get(`${OS}:${P.neutron}/v2.0/routers`,{headers:defH(getToken(r))})).data.routers));
app.post('/api/network/routers',         proxied(async r => (await axios.post(`${OS}:${P.neutron}/v2.0/routers`,{router:r.body},{headers:defH(getToken(r))})).data.router));
app.put('/api/network/routers/:id',      proxied(async r => (await axios.put(`${OS}:${P.neutron}/v2.0/routers/${r.params.id}`,{router:r.body},{headers:defH(getToken(r))})).data.router));
app.delete('/api/network/routers/:id',   proxied(async r => { await axios.delete(`${OS}:${P.neutron}/v2.0/routers/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.post('/api/network/routers/:id/interface',        proxied(async r => (await axios.put(`${OS}:${P.neutron}/v2.0/routers/${r.params.id}/add_router_interface`,r.body,{headers:defH(getToken(r))})).data));
app.post('/api/network/routers/:id/interface/remove', proxied(async r => (await axios.put(`${OS}:${P.neutron}/v2.0/routers/${r.params.id}/remove_router_interface`,r.body,{headers:defH(getToken(r))})).data));
app.get('/api/network/floatingips',      proxied(async r => (await axios.get(`${OS}:${P.neutron}/v2.0/floatingips`,{headers:defH(getToken(r))})).data.floatingips));
app.post('/api/network/floatingips',     proxied(async r => (await axios.post(`${OS}:${P.neutron}/v2.0/floatingips`,{floatingip:r.body},{headers:defH(getToken(r))})).data.floatingip));
app.put('/api/network/floatingips/:id',  proxied(async r => (await axios.put(`${OS}:${P.neutron}/v2.0/floatingips/${r.params.id}`,{floatingip:r.body},{headers:defH(getToken(r))})).data.floatingip));
app.delete('/api/network/floatingips/:id',proxied(async r => { await axios.delete(`${OS}:${P.neutron}/v2.0/floatingips/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.get('/api/network/security-groups',  proxied(async r => (await axios.get(`${OS}:${P.neutron}/v2.0/security-groups`,{headers:defH(getToken(r))})).data.security_groups));
app.post('/api/network/security-groups', proxied(async r => (await axios.post(`${OS}:${P.neutron}/v2.0/security-groups`,{security_group:r.body},{headers:defH(getToken(r))})).data.security_group));
app.delete('/api/network/security-groups/:id', proxied(async r => { await axios.delete(`${OS}:${P.neutron}/v2.0/security-groups/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.get('/api/network/security-group-rules', proxied(async r => {
  const qs = r.query.security_group_id ? `?security_group_id=${r.query.security_group_id}` : '';
  return (await axios.get(`${OS}:${P.neutron}/v2.0/security-group-rules${qs}`,{headers:defH(getToken(r))})).data.security_group_rules;
}));
app.post('/api/network/security-group-rules', proxied(async r => (await axios.post(`${OS}:${P.neutron}/v2.0/security-group-rules`,{security_group_rule:r.body},{headers:defH(getToken(r))})).data.security_group_rule));
app.delete('/api/network/security-group-rules/:id', proxied(async r => { await axios.delete(`${OS}:${P.neutron}/v2.0/security-group-rules/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.get('/api/network/agents', proxied(async r => (await axios.get(`${OS}:${P.neutron}/v2.0/agents`,{headers:defH(getToken(r))})).data.agents));

// ─────────────────────────────────────────────────────────────────────────────
// GLANCE — IMAGES  (returns [] if service down, handles HTML error responses)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/images', proxied(async r => {
  const tk = getToken(r);
  if (!tk) return [];
  return await safeFetch(async () => {
    const res = await axios.get(`${OS}:${P.glance}/v2/images?limit=500&sort=created_at:desc`, {
      headers: { 'X-Auth-Token': tk, 'Accept': 'application/json' },
    });
    // Glance sometimes returns the images array directly or nested
    return Array.isArray(res.data) ? res.data : (res.data.images || []);
  }, []);
}));
app.get('/api/images/:id', proxied(async r =>
  (await axios.get(`${OS}:${P.glance}/v2/images/${r.params.id}`, {headers:{'X-Auth-Token':getToken(r)}})).data
));
app.delete('/api/images/:id', proxied(async r => {
  await axios.delete(`${OS}:${P.glance}/v2/images/${r.params.id}`, {headers:{'X-Auth-Token':getToken(r)}});
  return { success:true };
}));

// ─────────────────────────────────────────────────────────────────────────────
// CINDER — VOLUMES  (all routes gracefully return [] if Cinder is down)
// ─────────────────────────────────────────────────────────────────────────────
const cinderBase = (pid) => `${OS}:${P.cinder}/v3/${pid || _projectId}`;

app.get('/api/volumes', proxied(async r => {
  const pid = _projectId;
  if (!pid) return [];
  return await safeFetch(() =>
    axios.get(`${cinderBase(pid)}/volumes/detail`, {headers:defH(getToken(r))}).then(x => x.data.volumes)
  , []);
}));
app.post('/api/volumes', proxied(async r =>
  (await axios.post(`${cinderBase()}/volumes`, {volume:r.body}, {headers:defH(getToken(r))})).data.volume
));
app.delete('/api/volumes/:id', proxied(async r => {
  await axios.delete(`${cinderBase()}/volumes/${r.params.id}`, {headers:defH(getToken(r))});
  return { success:true };
}));
app.post('/api/volumes/:id/action', proxied(async r =>
  (await axios.post(`${cinderBase()}/volumes/${r.params.id}/action`, r.body, {headers:defH(getToken(r))})).data
));
// Note: /api/volumes/snapshots MUST be before /api/volumes/:id  (more specific first)
app.get('/api/volumes/snapshots', proxied(async r => {
  if (!_projectId) return [];
  return await safeFetch(() =>
    axios.get(`${cinderBase()}/snapshots/detail`, {headers:defH(getToken(r))}).then(x => x.data.snapshots)
  , []);
}));
app.post('/api/volumes/snapshots', proxied(async r =>
  (await axios.post(`${cinderBase()}/snapshots`, {snapshot:r.body}, {headers:defH(getToken(r))})).data.snapshot
));
app.delete('/api/volumes/snapshots/:id', proxied(async r => {
  await axios.delete(`${cinderBase()}/snapshots/${r.params.id}`, {headers:defH(getToken(r))});
  return { success:true };
}));
app.get('/api/volumes/types', proxied(async r => {
  if (!_projectId) return [];
  return await safeFetch(() =>
    axios.get(`${cinderBase()}/types`, {headers:defH(getToken(r))}).then(x => x.data.volume_types)
  , []);
}));
app.get('/api/volumes/quota', proxied(async r => {
  const pid = r.query.project_id || _projectId;
  if (!pid) return {};
  return await safeFetch(() =>
    axios.get(`${cinderBase(pid)}/os-quota-sets/${pid}?usage=true`, {headers:defH(getToken(r))}).then(x => x.data.quota_set)
  , {});
}));

// ─────────────────────────────────────────────────────────────────────────────
// MAGNUM — Container Clusters
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/magnum/clusters', proxied(async r =>
  await safeFetch(() =>
    axios.get(`${OS}:${P.magnum}/v1/clusters`, {headers:defH(getToken(r))}).then(x => x.data.clusters || [])
  , [])
));
app.get('/api/magnum/clusters/:id',             proxied(async r => (await axios.get(`${OS}:${P.magnum}/v1/clusters/${r.params.id}`,{headers:defH(getToken(r))})).data));
app.post('/api/magnum/clusters',                proxied(async r => (await axios.post(`${OS}:${P.magnum}/v1/clusters`,r.body,{headers:defH(getToken(r))})).data));
app.delete('/api/magnum/clusters/:id',          proxied(async r => { await axios.delete(`${OS}:${P.magnum}/v1/clusters/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));
app.patch('/api/magnum/clusters/:id',           proxied(async r => (await axios.patch(`${OS}:${P.magnum}/v1/clusters/${r.params.id}`,r.body,{headers:defH(getToken(r))})).data));
app.get('/api/magnum/clustertemplates', proxied(async r =>
  await safeFetch(() =>
    axios.get(`${OS}:${P.magnum}/v1/clustertemplates`, {headers:defH(getToken(r))}).then(x => x.data.clustertemplates || [])
  , [])
));
app.post('/api/magnum/clustertemplates',        proxied(async r => (await axios.post(`${OS}:${P.magnum}/v1/clustertemplates`,r.body,{headers:defH(getToken(r))})).data));
app.delete('/api/magnum/clustertemplates/:id',  proxied(async r => { await axios.delete(`${OS}:${P.magnum}/v1/clustertemplates/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));

// ─────────────────────────────────────────────────────────────────────────────
// HEAT — Orchestration
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/heat/stacks', proxied(async r => {
  const pid = _projectId || '';
  return await safeFetch(() =>
    axios.get(`${OS}:${P.heat}/v1/${pid}/stacks`, {headers:defH(getToken(r))}).then(x => x.data.stacks || [])
  , []);
}));
app.get('/api/heat/stacks/:name/:id',           proxied(async r => (await axios.get(`${OS}:${P.heat}/v1/${_projectId}/stacks/${r.params.name}/${r.params.id}`,{headers:defH(getToken(r))})).data.stack));
app.get('/api/heat/stacks/:name/:id/resources', proxied(async r => (await axios.get(`${OS}:${P.heat}/v1/${_projectId}/stacks/${r.params.name}/${r.params.id}/resources`,{headers:defH(getToken(r))})).data.resources));
app.get('/api/heat/stacks/:name/:id/events',    proxied(async r => (await axios.get(`${OS}:${P.heat}/v1/${_projectId}/stacks/${r.params.name}/${r.params.id}/events?limit=50`,{headers:defH(getToken(r))})).data.events));
app.post('/api/heat/stacks',                    proxied(async r => (await axios.post(`${OS}:${P.heat}/v1/${_projectId}/stacks`,r.body,{headers:defH(getToken(r))})).data));
app.put('/api/heat/stacks/:name/:id',           proxied(async r => { await axios.put(`${OS}:${P.heat}/v1/${_projectId}/stacks/${r.params.name}/${r.params.id}`,r.body,{headers:defH(getToken(r))}); return {success:true}; }));
app.delete('/api/heat/stacks/:name/:id',        proxied(async r => { await axios.delete(`${OS}:${P.heat}/v1/${_projectId}/stacks/${r.params.name}/${r.params.id}`,{headers:defH(getToken(r))}); return {success:true}; }));


// ─────────────────────────────────────────────────────────────────────────────
// DEBUG — test Nova directly, helps diagnose microversion issues
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/debug/nova', async (req, res) => {
  const tk = getToken(req);
  if (!tk) return res.json({ error:'no token' });
  const results = {};
  // Try different microversions
  for (const mv of ['2.1', '2.72', '2.79', '2.87', '2.95']) {
    try {
      const r = await axios.get(`${OS}:${P.nova}/v2.1/servers/detail`, {
        headers: { 'X-Auth-Token':tk, 'Content-Type':'application/json', 'X-OpenStack-Nova-Microversion':mv },
        timeout: 5000,
      });
      results[mv] = { ok: true, count: r.data.servers?.length };
    } catch(e) {
      results[mv] = { ok: false, status: e.response?.status, msg: e.response?.data?.computeFault?.message || e.message };
    }
  }
  res.json({ projectId:_projectId, tokenPresent:!!tk, microversions: results });
});

app.get('/api/debug/nova-versions', async (req, res) => {
  try {
    const r = await axios.get(`${OS}:${P.nova}/`, { timeout:5000 });
    res.json(r.data);
  } catch(e) {
    res.json({ error: e.message, status: e.response?.status });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`\n🚀 Server and Suffer v2.1\n   API:  http://0.0.0.0:${PORT}\n   SSH:  ws://0.0.0.0:${PORT}/ws/ssh\n`)
);
