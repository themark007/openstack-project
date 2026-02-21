# ⬡ MARK CLOUD
### Futuristic OpenStack Dashboard · 192.168.61.150

```
User → Mark Cloud UI (React) → Backend API (Express) → OpenStack Controller
                                                          ├── Keystone :5000
                                                          ├── Nova     :8774
                                                          ├── Neutron  :9696
                                                          └── Glance   :9292
```

---

## 🚀 Quick Start

### 1. Backend API
```bash
cd backend
npm install
node server.js
# → Listening on http://localhost:3001
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## 🔐 Login
- **Username**: your OpenStack username (e.g. `admin`)
- **Password**: your OpenStack password
- **Project**: project name (default: `admin`)

The backend proxies all requests to your VMware-hosted OpenStack controller at **192.168.61.150**.

---

## 📡 API Endpoints

| Method | Path | Service |
|--------|------|---------|
| POST | `/api/auth/login` | Keystone auth token |
| GET | `/api/compute/servers` | List instances |
| POST | `/api/compute/servers` | Launch instance |
| DELETE | `/api/compute/servers/:id` | Delete instance |
| POST | `/api/compute/servers/:id/action` | Start/Stop/Reboot |
| GET | `/api/compute/flavors` | Flavor list |
| GET | `/api/compute/keypairs` | Key pairs |
| GET | `/api/compute/quota` | Quota usage |
| GET | `/api/network/networks` | Networks |
| GET | `/api/network/routers` | Routers |
| GET | `/api/network/floatingips` | Floating IPs |
| GET | `/api/network/security-groups` | Security groups |
| GET | `/api/images` | Glance images |
| GET | `/api/identity/projects` | Projects |
| GET | `/api/identity/users` | Users |

---

## 🎨 Features
- **Futuristic cyberpunk UI** with animated particle field, scanlines, glitch effects
- **Real-time OpenStack data** — auto-refreshes every 30s
- **Instance management** — launch, start, stop, reboot, delete
- **Network topology** view with floating IPs
- **Image catalog** with metadata
- **Security group** rules visualization
- **Quota monitoring**
- **Holographic animations** — glowing rings, pulsing nodes, orbital effects

---

## ⚙️ OpenStack Requirements
Make sure these ports are accessible from your host to 192.168.61.150:
- **5000** – Keystone
- **8774** – Nova
- **9696** – Neutron
- **9292** – Glance

> Tip: If running behind a firewall, open these ports in your VMware network config.
