// src/components/SSHTerminal.jsx
// Uses xterm.js as npm package (not CDN) — run: npm install xterm @xterm/addon-fit
import { useEffect, useRef, useState, useCallback } from "react";

// We import xterm lazily to avoid SSR issues
let XTerminal = null;
let FitAddon  = null;

async function loadXterm() {
  if (XTerminal) return; // already loaded
  try {
    const [xtermMod, fitMod] = await Promise.all([
      import('xterm'),
      import('@xterm/addon-fit')
    ]);
    XTerminal = xtermMod.Terminal;
    FitAddon  = fitMod?.FitAddon || null;
    // Also import CSS
    await import('xterm/css/xterm.css').catch(() => {});
  } catch(e) {
    console.error('xterm load failed:', e);
    throw new Error('Failed to load terminal library. Run: npm install xterm @xterm/addon-fit');
  }
}

function getServerIP(server) {
  const addrs = Object.values(server?.addresses || {}).flat();
  const pub   = addrs.find(a => a["OS-EXT-IPS:type"] === "floating");
  if (pub) return pub.addr;
  const fixed = addrs.find(a => !a.addr.startsWith("169.254"));
  return fixed?.addr || "";
}

export default function SSHTerminal({ server, onClose }) {
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const wsRef        = useRef(null);
  const fitRef       = useRef(null);
  const connectedRef = useRef(false);

  const [status,   setStatus]   = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [connForm, setConnForm] = useState({
    host:       getServerIP(server),
    port:       "22",
    username:   "root",
    password:   "",
    privateKey: "",
  });
  const [useKey, setUseKey] = useState(false);

  const set = (k, v) => setConnForm(p => ({ ...p, [k]: v }));

  const connect = useCallback(async () => {
    if (!connForm.host || !connForm.username) { setErrorMsg("Host and username required"); return; }
    setStatus("connecting");
    setErrorMsg("");
    connectedRef.current = false;

    // Load xterm npm package
    try {
      await loadXterm();
    } catch(e) {
      setStatus("error");
      setErrorMsg(e.message);
      return;
    }

    // Init terminal
    const term = new XTerminal({
      theme: {
        background:          '#030b0d',
        foreground:          '#c8f0e8',
        cursor:              '#00ffcc',
        cursorAccent:        '#030b0d',
        selectionBackground: 'rgba(0,255,200,0.2)',
        black:         '#030b0d', red:         '#ff4466', green:         '#00ff88', yellow:         '#ffaa00',
        blue:          '#00aaff', magenta:     '#aa44ff', cyan:          '#00ffcc', white:          '#c8f0e8',
        brightBlack:   '#4a7a6e', brightRed:   '#ff6680', brightGreen:   '#33ff99', brightYellow:   '#ffcc33',
        brightBlue:    '#33bbff', brightMagenta:'#bb66ff', brightCyan:   '#33ffdd', brightWhite:    '#e0fff8',
      },
      fontFamily:  "'Share Tech Mono', 'Courier New', monospace",
      fontSize:     14,
      lineHeight:   1.4,
      cursorBlink:  true,
      cursorStyle: 'block',
      scrollback:   5000,
      allowTransparency: false,
    });
    termRef.current = term;

    // FitAddon
    if (FitAddon) {
      const fit = new FitAddon();
      fitRef.current = fit;
      term.loadAddon(fit);
    }

    term.open(containerRef.current);
    if (fitRef.current) { try { fitRef.current.fit(); } catch(_){} }

    const cols = term.cols || 120;
    const rows = term.rows || 40;

    // ── WebSocket connection ───────────────────────────────────────────────
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Try vite proxy first, then direct backend
    const candidates = [
      `${wsProto}//${window.location.host}/ws/ssh`,
      `ws://${window.location.hostname}:3001/ws/ssh`,
    ];

    term.writeln('\x1b[36mConnecting to SSH...\x1b[0m');

    let attemptIdx = 0;

    function tryConnect(url) {
      term.writeln(`\x1b[33mTrying: ${url}\x1b[0m`);
      console.log('[SSH] Trying WS:', url);

      let ws;
      try { ws = new WebSocket(url); }
      catch(e) { handleFail(`Invalid URL: ${e.message}`); return; }

      wsRef.current = ws;

      const timeout = setTimeout(() => {
        if (!connectedRef.current) {
          ws.close();
          handleFail(`Timeout connecting to ${url}`);
        }
      }, 15000);

      ws.onopen = () => {
        console.log('[SSH] WS open →', url);
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
              clearTimeout(timeout);
              connectedRef.current = true;
              setStatus('connected');
              term.writeln('\x1b[32m[Connected]\x1b[0m');
              term.focus();
            } else if (msg.data === 'DISCONNECTED') {
              clearTimeout(timeout);
              setStatus('disconnected');
              term.writeln('\r\n\x1b[33m[Session closed]\x1b[0m');
            }
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            setStatus('error');
            setErrorMsg(msg.data);
            term.writeln(`\r\n\x1b[31m[SSH Error: ${msg.data}]\x1b[0m`);
          }
        } catch(_) {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        console.warn('[SSH] WS error on', url);
      };

      ws.onclose = (e) => {
        clearTimeout(timeout);
        console.log('[SSH] WS closed', e.code, 'connected:', connectedRef.current);
        if (connectedRef.current) {
          setStatus('disconnected');
          return;
        }
        // Try next candidate
        attemptIdx++;
        if (attemptIdx < candidates.length) {
          tryConnect(candidates[attemptIdx]);
        } else {
          handleFail(
            `All WebSocket endpoints failed.\n\n` +
            `Tried:\n${candidates.map(u=>'  • '+u).join('\n')}\n\n` +
            `Fix: Make sure the backend (node server.js) is running on port 3001\n` +
            `and the Vite proxy is configured (check vite.config.js).`
          );
        }
      };

      // stdin → ws
      const dataDisp = term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'data', data }));
      });

      // resize
      const onResize = () => {
        try {
          if (fitRef.current) fitRef.current.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type:'resize', cols:term.cols, rows:term.rows }));
          }
        } catch(_) {}
      };
      window.addEventListener('resize', onResize);

      // cleanup on close
      ws.addEventListener('close', () => {
        window.removeEventListener('resize', onResize);
        dataDisp.dispose();
      }, { once: true });
    }

    function handleFail(msg) {
      setStatus('error');
      setErrorMsg(msg);
    }

    tryConnect(candidates[0]);
  }, [connForm, useKey]);

  const disconnect = () => {
    if (wsRef.current) { try { wsRef.current.close(); } catch(_){} }
    if (termRef.current) { try { termRef.current.dispose(); } catch(_){} termRef.current = null; }
    connectedRef.current = false;
    setStatus('idle');
  };

  useEffect(() => {
    return () => {
      if (wsRef.current)  { try { wsRef.current.close();   } catch(_){} }
      if (termRef.current){ try { termRef.current.dispose();} catch(_){} }
    };
  }, []);

  const statusColor = { idle:'#888', connecting:'#ffaa00', connected:'#00ff88', error:'#ff4466', disconnected:'#ff8800' };
  const statusLabel = { idle:'READY', connecting:'CONNECTING…', connected:'CONNECTED', error:'ERROR', disconnected:'DISCONNECTED' };

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
            <span className="ssh-status" style={{ color: statusColor[status] }}>● {statusLabel[status]}</span>
            {status === 'connected' && <button className="ssh-btn warn" onClick={disconnect}>DISCONNECT</button>}
            <button className="ssh-btn danger" onClick={onClose}>✕ CLOSE</button>
          </div>
        </div>

        {/* Connection form */}
        {(status === 'idle' || status === 'error') && (
          <div className="ssh-connect-form">
            <div className="ssh-form-grid">
              <div className="ssh-field">
                <label>HOST / IP</label>
                <input value={connForm.host} onChange={e => set('host', e.target.value)} placeholder="192.168.x.x" />
              </div>
              <div className="ssh-field">
                <label>PORT</label>
                <input value={connForm.port} onChange={e => set('port', e.target.value)} placeholder="22" />
              </div>
              <div className="ssh-field">
                <label>USERNAME</label>
                <input value={connForm.username} onChange={e => set('username', e.target.value)} placeholder="root" />
              </div>
              <div className="ssh-field">
                <label>AUTH METHOD</label>
                <div className="ssh-auth-toggle">
                  <button className={`ssh-auth-tab ${!useKey ? 'active' : ''}`} onClick={() => setUseKey(false)}>PASSWORD</button>
                  <button className={`ssh-auth-tab ${useKey  ? 'active' : ''}`} onClick={() => setUseKey(true)}>PRIVATE KEY</button>
                </div>
              </div>
              {!useKey ? (
                <div className="ssh-field wide">
                  <label>PASSWORD</label>
                  <input type="password" value={connForm.password} onChange={e => set('password', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && connect()} />
                </div>
              ) : (
                <div className="ssh-field wide">
                  <label>PRIVATE KEY (PEM)</label>
                  <textarea value={connForm.privateKey} onChange={e => set('privateKey', e.target.value)}
                    rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." />
                </div>
              )}
            </div>
            {errorMsg && (
              <div className="ssh-error" style={{ whiteSpace: 'pre-wrap' }}>⚠ {errorMsg}</div>
            )}
            <button className="ssh-connect-btn" onClick={connect}>⎗ CONNECT</button>
          </div>
        )}

        {/* Connecting spinner */}
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
          style={{ display: (status === 'connected' || status === 'disconnected') ? 'flex' : 'none', flex: 1 }}
        />

        {status === 'disconnected' && (
          <div className="ssh-disconnected-bar">
            <span>Session ended.</span>
            <button className="ssh-btn" onClick={() => { disconnect(); setStatus('idle'); }}>RECONNECT</button>
          </div>
        )}
      </div>
    </div>
  );
}
