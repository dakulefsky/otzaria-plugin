(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var VERSION = '0.2.0';
  var KEY = 'test-bridge-settings';
  var RING = [];
  var RING_MAX = 500;
  var agent = null;
  function clip(v, n) {
    var s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { s = String(v); }
    if (s === undefined) return undefined;
    return s.length > n ? s.slice(0, n) + '…[' + s.length + ' chars]' : s;
  }
  function addLog(level, message, data) {
    var e = { time: new Date().toISOString(), level: level, message: clip(message, 300) };
    if (data !== undefined) e.data = clip(data, 1500);
    RING.push(e);
    if (RING.length > RING_MAX) RING.shift();
    var a = $('activity'), line = document.createElement('div');
    line.textContent = e.time.slice(11, 19) + ' ' + level + ' ' + e.message;
    a.appendChild(line);
    while (a.childNodes.length > 120) a.removeChild(a.firstChild);
    a.scrollTop = a.scrollHeight;
  }
  ['log', 'info', 'warn', 'error'].forEach(function (lvl) {
    var orig = console[lvl];
    console[lvl] = function () {
      try { addLog(lvl === 'error' ? 'error' : 'console-' + lvl, Array.prototype.map.call(arguments, function (x) { return clip(x, 300); }).join(' ')); } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) { addLog('error', 'Uncaught: ' + e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')); });
  window.addEventListener('unhandledrejection', function (e) { addLog('error', 'Unhandled rejection: ' + clip(String(e.reason && e.reason.message ? e.reason.message : e.reason), 300)); });
  window.addEventListener('online', function () { addLog('connectivity', 'online'); });
  window.addEventListener('offline', function () { addLog('connectivity', 'offline'); });
  function bridge(method, params) {
    if (!window.Otzaria || typeof window.Otzaria.call !== 'function') return Promise.reject(new Error('window.Otzaria.call is not available'));
    return Promise.resolve().then(function () { return window.Otzaria.call(method, params); });
  }
  function settings() {
    return { port: $('s-port').value.trim(), token: $('s-token').value.trim(), transport: $('s-transport').value, method: $('s-method').value.trim(), auto: $('s-auto').checked };
  }
  function saveSettings() {
    /* The bearer token is deliberately excluded from persistent storage. */
    var s = settings(), safe = { port: s.port, transport: s.transport, method: s.method, auto: s.auto }, json = JSON.stringify(safe);
    try { localStorage.setItem(KEY, json); } catch (e) {}
    return bridge('storage.set', { key: KEY, value: json }).catch(function () {});
  }
  function loadSettings() {
    return bridge('storage.get', { key: KEY }).then(function (r) {
      var v = r && typeof r === 'object' && 'value' in r ? r.value : r;
      var saved = typeof v === 'string' ? JSON.parse(v) : v;
      if (saved && typeof saved === 'object') {
        delete saved.token;
        var clean = JSON.stringify({ port: saved.port, transport: saved.transport, method: saved.method, auto: saved.auto });
        try { localStorage.setItem(KEY, clean); } catch (e) {}
        bridge('storage.set', { key: KEY, value: clean }).catch(function () {});
      }
      return saved;
    }).catch(function () {
      try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
    });
  }
  function http(method, path, body) {
    var s = settings();
    if (!/^\d{2,5}$/.test(s.port)) return Promise.reject(new Error('Port must be a number'));
    var url = 'http://127.0.0.1:' + s.port + path;
    var headers = { authorization: 'Bearer ' + s.token, 'content-type': 'application/json' };
    var bodyText = body === undefined ? undefined : JSON.stringify(body), p;
    if (s.transport === 'bridge') {
      p = bridge(s.method, { url: url, method: method, headers: headers, body: bodyText }).then(function (res) {
        var u = window.BridgeCore.unwrapHttp(res), j = null;
        try { j = JSON.parse(u.body); } catch (e) {}
        return { status: u.status, json: j };
      });
    } else {
      p = fetch(url, { method: method, headers: headers, body: bodyText }).then(function (r) {
        return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, json: j }; });
      });
    }
    return p;
  }
  function approve(info) {
    return new Promise(function (resolve) {
      var box = $('approvals');
      if (box.firstChild && box.firstChild.className === 'hint') box.textContent = '';
      var item = document.createElement('div'); item.className = 'item';
      var h = document.createElement('div'); h.textContent = 'The assistant wants to call: ' + info.method; item.appendChild(h);
      var why = document.createElement('div'); why.className = 'hint'; why.textContent = 'Needs approval because: ' + info.reason; item.appendChild(why);
      var pre = document.createElement('pre'); pre.textContent = JSON.stringify(info.params, null, 2); item.appendChild(pre);
      function done(ok) {
        if (item.parentNode === box) box.removeChild(item);
        if (!box.firstChild) { var n = document.createElement('span'); n.className = 'hint'; n.textContent = 'Nothing waiting.'; box.appendChild(n); }
        addLog('approval', (ok ? 'approved ' : 'declined ') + info.method); resolve(ok);
      }
      var a = document.createElement('button'); a.type = 'button'; a.textContent = 'Approve'; a.onclick = function () { done(true); };
      var d = document.createElement('button'); d.type = 'button'; d.textContent = 'Decline'; d.onclick = function () { done(false); };
      item.appendChild(a); item.appendChild(d); box.appendChild(item); a.focus();
      addLog('approval', 'waiting for a click on ' + info.method);
    });
  }
  function getLogs(p) {
    p = p || {};
    var limit = Math.min(Math.max(parseInt(p.limit, 10) || 100, 1), 500);
    var out = RING.filter(function (e) { return (p.level !== 'error' || e.level === 'error' || e.level === 'call-error') && (!p.since || e.time > p.since); });
    return { total: RING.length, returned: Math.min(limit, out.length), entries: out.slice(-limit) };
  }
  function info() {
    var o = window.Otzaria;
    return { pluginVersion: VERSION, hasOtzaria: typeof o !== 'undefined', otzariaKeys: o ? Object.keys(o) : [], hasCall: !!(o && typeof o.call === 'function'), hasOn: !!(o && typeof o.on === 'function'), online: navigator.onLine, userAgent: navigator.userAgent, viewport: window.innerWidth + 'x' + window.innerHeight, jsErrors: (window.__errors || []).slice(-20) };
  }
  function setState(s) { $('state').textContent = s.connected ? 'Connected to the companion' : (s.lastError ? 'Not connected: ' + s.lastError : 'Not connected'); }
  function connect() {
    var s = settings();
    if (!/^\d{32}$/.test(s.token) || !/^[0-9a-f]{32}$/.test(s.token)) { $('state').textContent = 'Enter the 32-character pairing token shown by the otzaria_status MCP tool'; return; }
    saveSettings();
    if (agent) agent.stop();
    agent = window.BridgeCore.createAgent({
      http: http, bridgeCall: bridge, approve: approve, log: addLog, getLogs: getLogs, info: info, onState: setState,
      autoReadOnly: function () { return $('s-auto').checked; },
      version: VERSION, userAgent: navigator.userAgent, transport: s.transport
    });
    addLog('bridge', 'connecting to 127.0.0.1:' + s.port + ' via ' + s.transport);
    agent.start().then(function () { addLog('bridge', 'connected'); }, function (e) { addLog('error', 'connect failed: ' + e.message); });
  }
  function disconnect() { if (agent) { agent.stop(); agent = null; addLog('bridge', 'disconnected'); } }
  $('btn-connect').addEventListener('click', connect);
  $('btn-disconnect').addEventListener('click', disconnect);
  loadSettings().then(function (s) {
    if (!s) return;
    if (s.port) $('s-port').value = s.port;
    if (s.transport) $('s-transport').value = s.transport;
    if (s.method) $('s-method').value = s.method;
    if (typeof s.auto === 'boolean') $('s-auto').checked = s.auto;
  });
  addLog('bridge', 'Test Bridge ' + VERSION + ' loaded');
})();
