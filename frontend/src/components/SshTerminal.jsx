// src/components/SSHTerminal.jsx
// Inline xterm.js via CDN script injection + WebSocket to backend SSH proxy
import { useEffect, useRef, useState, useCallback } from "react";

// Dynamically load xterm from CDN
function loadXterm() {
  return new Promise((resolve, reject) => {
    if (window.Terminal) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js';
    script.onload = () => {
      // Load FitAddon
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/addon-fit.min.js';
      s2.onload = resolve;
      s2.onerror = () => resolve(); // ok if fit addon fails
      document.head.appendChild(s2);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function SSHTerminal({ server, onClose }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef   = useRef(null);
  const fitRef  = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | error | disconnected
  const [connForm, setConnForm] = useState({
    host: getServerIP(server),
    port: "22",
    username: "root",
    password: "",
    privateKey: "",
  });
  const [useKey, setUseKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function getServerIP(server) {
    const addrs = Object.values(server?.addresses || {}).flat();
    // prefer floating / non-169.254 IP
    const pub = addrs.find(a => a["OS-EXT-IPS:type"] === "floating");
    if (pub) return pub.addr;
    const fixed = addrs.find(a => !a.addr.startsWith("169.254"));
    return fixed?.addr || "";
  }

  const connect = useCallback(async () => {
    if (!connForm.host || !connForm.username) { setErrorMsg("Host and username required"); return; }
    setStatus("connecting"); setErrorMsg("");

    await loadXterm().catch(()=>{});

    // Init xterm
    const term = new window.Terminal({
      theme: {
        background: '#030b0d',
        foreground: '#c8f0e8',
        cursor:     '#00ffcc',
        cursorAccent:'#030b0d',
        selectionBackground: 'rgba(0,255,200,0.2)',
        black:   '#030b0d', red:'#ff4466', green:'#00ff88', yellow:'#ffaa00',
        blue:    '#00aaff', magenta:'#aa44ff', cyan:'#00ffcc', white:'#c8f0e8',
        brightBlack:'#4a7a6e', brightRed:'#ff6680', brightGreen:'#33ff99',
        brightYellow:'#ffcc33', brightBlue:'#33bbff', brightMagenta:'#bb66ff',
        brightCyan:'#33ffdd', brightWhite:'#e0fff8',
      },
      fontFamily: "'Share Tech Mono', 'Courier New', monospace",
      fontSize:   14,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback:  5000,
      bellStyle:  'visual',
    });

    termRef.current = term;

    // FitAddon
    if (window.FitAddon) {
      const fit = new window.FitAddon.FitAddon();
      fitRef.current = fit;
      term.loadAddon(fit);
    }

    term.open(containerRef.current);
    if (fitRef.current) fitRef.current.fit();

    const cols = term.cols;
    const rows = term.rows;

    // WebSocket
    const ws = new WebSocket((`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}` + '//' + window.location.host + '/ws/ssh'));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'connect',
        host: connForm.host,
        port: parseInt(connForm.port) || 22,
        username: connForm.username,
        ...(useKey ? { privateKey: connForm.privateKey } : { password: connForm.password }),
        cols, rows,
      }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'status') {
          if (msg.data === 'CONNECTED') {
            setStatus('connected');
            term.focus();
          } else if (msg.data === 'DISCONNECTED') {
            setStatus('disconnected');
            term.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m');
          }
        } else if (msg.type === 'error') {
          setStatus('error');
          setErrorMsg(msg.data);
          term.writeln(`\r\n\x1b[31m[SSH Error: ${msg.data}]\x1b[0m`);
        }
      } catch(err) { console.error('WS parse error', err); }
    };

    ws.onerror = () => { setStatus('error'); setErrorMsg('WebSocket connection failed'); };
    ws.onclose = () => { if (status !== 'connected') setStatus('disconnected'); };

    // stdin → ws
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    // Resize
    const handleResize = () => {
      if (fitRef.current) {
        fitRef.current.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [connForm, useKey]);

  const disconnect = () => {
    if (wsRef.current) { wsRef.current.close(); }
    if (termRef.current) { termRef.current.dispose(); termRef.current = null; }
    setStatus('idle');
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (termRef.current) { try { termRef.current.dispose(); } catch(_){} }
    };
  }, []);

  const statusColor = { idle:"#888", connecting:"#ffaa00", connected:"#00ff88", error:"#ff4466", disconnected:"#ff8800" };
  const statusLabel = { idle:"READY", connecting:"CONNECTING…", connected:"CONNECTED", error:"ERROR", disconnected:"DISCONNECTED" };

  return (
    <div className="ssh-terminal-overlay" onClick={onClose}>
      <div className="ssh-terminal-box" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ssh-header">
          <div className="ssh-header-left">
            <span className="ssh-icon">⎗</span>
            <span className="ssh-title">SSH — {server?.name}</span>
            <span className="ssh-host">{connForm.host}:{connForm.port}</span>
          </div>
          <div className="ssh-header-right">
            <span className="ssh-status" style={{ color: statusColor[status] }}>
              ● {statusLabel[status]}
            </span>
            {status === 'connected' && (
              <button className="ssh-btn warn" onClick={disconnect}>DISCONNECT</button>
            )}
            <button className="ssh-btn danger" onClick={onClose}>✕ CLOSE</button>
          </div>
        </div>

        {/* Connection form */}
        {(status === 'idle' || status === 'error') && (
          <div className="ssh-connect-form">
            <div className="ssh-form-grid">
              <div className="ssh-field">
                <label>HOST / IP</label>
                <input value={connForm.host} onChange={e=>setConnForm(p=>({...p,host:e.target.value}))} placeholder="192.168.x.x" />
              </div>
              <div className="ssh-field">
                <label>PORT</label>
                <input value={connForm.port} onChange={e=>setConnForm(p=>({...p,port:e.target.value}))} placeholder="22" />
              </div>
              <div className="ssh-field">
                <label>USERNAME</label>
                <input value={connForm.username} onChange={e=>setConnForm(p=>({...p,username:e.target.value}))} placeholder="root" />
              </div>
              <div className="ssh-field">
                <label>AUTH METHOD</label>
                <div className="ssh-auth-toggle">
                  <button className={`ssh-auth-tab ${!useKey?"active":""}`} onClick={()=>setUseKey(false)}>PASSWORD</button>
                  <button className={`ssh-auth-tab ${useKey?"active":""}`}  onClick={()=>setUseKey(true)}>PRIVATE KEY</button>
                </div>
              </div>
              {!useKey ? (
                <div className="ssh-field wide">
                  <label>PASSWORD</label>
                  <input type="password" value={connForm.password} onChange={e=>setConnForm(p=>({...p,password:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&connect()} />
                </div>
              ) : (
                <div className="ssh-field wide">
                  <label>PRIVATE KEY (PEM content)</label>
                  <textarea value={connForm.privateKey} onChange={e=>setConnForm(p=>({...p,privateKey:e.target.value}))} rows={5} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." />
                </div>
              )}
            </div>
            {errorMsg && <div className="ssh-error">⚠ {errorMsg}</div>}
            <button className="ssh-connect-btn" onClick={connect}>⎗ CONNECT</button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="ssh-loading">
            <div className="ssh-loading-ring" />
            <span>Establishing SSH connection to {connForm.host}…</span>
          </div>
        )}

        {/* Terminal */}
        <div
          ref={containerRef}
          className="ssh-xterm-container"
          style={{ display: status === 'connected' || status === 'disconnected' ? 'block' : 'none' }}
        />

        {status === 'disconnected' && (
          <div className="ssh-disconnected-bar">
            <span>Session ended.</span>
            <button className="ssh-btn" onClick={()=>setStatus('idle')}>RECONNECT</button>
          </div>
        )}
      </div>
    </div>
  );
}
