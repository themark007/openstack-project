// src/pages/Login.jsx
import { useState } from "react";
import ParticleField from "../components/ParticleField.jsx";
import { GlitchText, Spinner } from "../components/UI.jsx";

export default function Login({ onLogin, loading, error }) {
  const [form, setForm] = useState({ username:"admin", password:"", project:"admin" });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  return (
    <div className="login-page">
      <ParticleField />
      <div className="login-box">
        <div className="login-logo">
          <div className="orb-ring r1" /><div className="orb-ring r2" /><div className="orb-ring r3" />
          <span className="orb-text-lg">SS</span>
        </div>
        <h1 className="login-title"><GlitchText>SERVER AND SUFFER</GlitchText></h1>
        <p className="login-sub">OpenStack Yoga · VMware · 192.168.61.150</p>

        <div className="login-fields">
          {[["username","text","admin"],["password","password",""],["project","text","admin"]].map(([f,t,ph])=>(
            <div key={f} className="login-field">
              <label>{f.toUpperCase()}</label>
              <input type={t} value={form[f]} placeholder={ph}
                onChange={e=>set(f,e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&onLogin(form)} />
            </div>
          ))}
          {error && <div className="login-error">⚠ {error}</div>}
          <button className="login-btn" onClick={()=>onLogin(form)} disabled={loading}>
            {loading ? <Spinner /> : "INITIALIZE CONNECTION"}
          </button>
        </div>

        <div className="login-services">
          {[["KEY","KEYSTONE"],["NOV","NOVA"],["NET","NEUTRON"],["GLN","GLANCE"],["CIN","CINDER"]].map(([k,s])=>(
            <div key={k} className="login-svc"><span className="dot active"/>{s}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

