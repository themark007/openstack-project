const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const OPENSTACK_HOST = 'http://192.168.61.150';
const KEYSTONE_PORT = 5000;
const NOVA_PORT = 8774;
const NEUTRON_PORT = 9696;
const GLANCE_PORT = 9292;

let authToken = null;
let projectId = null;

// ─────────────────────────────────────────────
// AUTH – Keystone
// ─────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password, project } = req.body;
  try {
    const response = await axios.post(`${OPENSTACK_HOST}:${KEYSTONE_PORT}/v3/auth/tokens`, {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: username,
              domain: { name: 'Default' },
              password: password
            }
          }
        },
        scope: {
          project: {
            name: project || 'admin',
            domain: { name: 'Default' }
          }
        }
      }
    });

    authToken = response.headers['x-subject-token'];
    projectId = response.data.token.project?.id;

    res.json({
      success: true,
      token: authToken,
      project: response.data.token.project,
      user: response.data.token.user,
      expires_at: response.data.token.expires_at
    });
  } catch (err) {
    console.error('Auth error:', err.response?.data || err.message);
    res.status(401).json({ success: false, error: err.response?.data?.error?.message || 'Authentication failed' });
  }
});

// ─────────────────────────────────────────────
// NOVA – Compute / Instances
// ─────────────────────────────────────────────
app.get('/api/compute/servers', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/servers/detail`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.servers);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/api/compute/servers', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.post(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/servers`, req.body, {
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' }
    });
    res.json(r.data.server);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.delete('/api/compute/servers/:id', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    await axios.delete(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/servers/${req.params.id}`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/api/compute/servers/:id/action', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.post(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/servers/${req.params.id}/action`, req.body, {
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' }
    });
    res.json({ success: true, data: r.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/compute/flavors', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/flavors/detail`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.flavors);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/compute/keypairs', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/os-keypairs`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.keypairs);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/compute/quota', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const pid = req.query.project_id || projectId;
    const r = await axios.get(`${OPENSTACK_HOST}:${NOVA_PORT}/v2.1/os-quota-sets/${pid}`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.quota_set);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ─────────────────────────────────────────────
// NEUTRON – Networking
// ─────────────────────────────────────────────
app.get('/api/network/networks', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NEUTRON_PORT}/v2.0/networks`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.networks);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/network/routers', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NEUTRON_PORT}/v2.0/routers`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.routers);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/network/floatingips', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NEUTRON_PORT}/v2.0/floatingips`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.floatingips);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/network/security-groups', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${NEUTRON_PORT}/v2.0/security-groups`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.security_groups);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ─────────────────────────────────────────────
// GLANCE – Images
// ─────────────────────────────────────────────
app.get('/api/images', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${GLANCE_PORT}/v2/images`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.images);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ─────────────────────────────────────────────
// KEYSTONE – Projects
// ─────────────────────────────────────────────
app.get('/api/identity/projects', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${KEYSTONE_PORT}/v3/projects`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.projects);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/identity/users', async (req, res) => {
  const token = req.headers['x-auth-token'] || authToken;
  try {
    const r = await axios.get(`${OPENSTACK_HOST}:${KEYSTONE_PORT}/v3/users`, {
      headers: { 'X-Auth-Token': token }
    });
    res.json(r.data.users);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'online', controller: '192.168.61.150', time: new Date() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Mark Cloud API running on port ${PORT}`));
