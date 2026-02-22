// Dynamic base URL — works both locally and through Cloudflare tunnel
// Backend runs on port 3001, frontend on 3000
// When tunneled, we need to target the backend tunnel URL separately
// BUT since backend and frontend share same cloudflare domain in this setup,
// we use vite proxy: /api/* → localhost:3001  (see vite.config.js)
const BASE = '/api';

let _token = null;
export const setToken = (t) => { _token = t; };
export const getToken = () => _token;

export async function api(path, opts = {}, token) {
  const tk = token || _token;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(tk ? { 'X-Auth-Token': tk } : {}),
      ...opts.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

export const GET  = (path, token)       => api(path, {}, token);
export const POST = (path, body, token) => api(path, { method:'POST',   body:JSON.stringify(body) }, token);
export const PUT  = (path, body, token) => api(path, { method:'PUT',    body:JSON.stringify(body) }, token);
export const DEL  = (path, token)       => api(path, { method:'DELETE' }, token);
