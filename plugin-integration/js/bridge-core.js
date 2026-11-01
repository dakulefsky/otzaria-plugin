/* Poll loop and command handlers for the Test Bridge plugin. DOM-free so it can be tested in Node. */
(function (root) {
  'use strict';
  var Policy = (typeof module !== 'undefined' && module.exports) ? require('./bridge-policy.js') : root.BridgePolicy;
  var Filter = (typeof module !== 'undefined' && module.exports) ? require('./pdf-filter.js') : root.PdfFilter;
  var MAX_RESULT_CHARS = 200000, MAX_PAGES = 12;
  function isValidPort(value) {
    if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return false;
    var port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }
  function unwrapHttp(res) {
    if (typeof res === 'string') return { status: 200, body: res };
    if (!res || typeof res !== 'object') return { status: 0, body: '' };
    var status = res.status || res.statusCode || 200;
    var body = res.body !== undefined ? res.body : res.text !== undefined ? res.text : res.data;
    if (body && typeof body === 'object') body = JSON.stringify(body);
    return { status: status, body: body === undefined ? '' : String(body) };
  }
  function pickText(res) {
    if (typeof res === 'string') return res;
    if (!res || typeof res !== 'object') return '';
    var best = '';
    (function walk(o, d) {
      if (d > 3 || !o) return;
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (typeof v === 'string' && v.length > best.length) best = v;
        else if (v && typeof v === 'object') walk(v, d + 1);
      });
    })(res, 0);
    return best;
  }
  function clip(v) {
    var s = JSON.stringify(v);
    if (s === undefined) return null;
    return s.length > MAX_RESULT_CHARS ? { truncated: true, chars: s.length, head: s.slice(0, MAX_RESULT_CHARS) } : v;
  }
  function msg(e) { return String(e && e.message ? e.message : e); }
  function createAgent(deps) {
    var running = false, backoff = 1000;
    var state = { connected: false, lastError: null, handled: 0, lastCommand: null };
    function notify() { if (deps.onState) deps.onState(state); }
    function runCall(method, params) {
      deps.log('call', method, { params: params });
      return Promise.resolve(deps.bridgeCall(method, params || {})).then(function (res) {
        deps.log('call-ok', method, { result: res }); return clip(res);
      }, function (err) { deps.log('call-error', method, { error: msg(err) }); throw err; });
    }
    var handlers = {
      ping: function () { return Promise.resolve({ pong: true }); },
      info: function () { return Promise.resolve(deps.info()); },
      logs: function (p) { return Promise.resolve(deps.getLogs(p || {})); },
      call: function (p) {
        var v = Policy.classify(p && p.method, deps.allowlist());
        if (v.kind === 'invalid') return Promise.reject(new Error('Invalid method: ' + v.reason));
        if (v.kind === 'read') return runCall(p.method, p.params);
        return Promise.resolve(deps.approve({ method: p.method, params: p.params || {}, reason: v.reason })).then(function (ok) {
          if (!ok) throw new Error('Declined by the user in the Test Bridge panel');
          return runCall(p.method, p.params);
        });
      },
      discover: function (p) {
        var pages = (p && p.pages) || [];
        if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES) return Promise.reject(new Error('pages must be 1 to ' + MAX_PAGES + ' URLs'));
        /* Discovery is pinned to one known method; callers cannot select an arbitrary RPC. */
        var fetchMethod = 'network.fetch', out = [], chain = Promise.resolve();
        pages.forEach(function (page) {
          chain = chain.then(function () {
            try { new URL(page); } catch (e) { out.push({ page: page, error: 'unparseable URL' }); return; }
            if (!Filter.isAllowedPageUrl(page)) {
              out.push({ page: page, error: 'only HTTPS pages on approved Oraysa hosts, without credentials or nonstandard ports, may be fetched' }); return;
            }
            return Promise.resolve(deps.bridgeCall(fetchMethod, { url: page })).then(function (res) {
              var responseUrl = res && typeof res === 'object' && (res.url || res.finalUrl || res.responseURL);
              if (responseUrl && !Filter.isAllowedPageUrl(responseUrl)) {
                out.push({ page: page, error: 'fetch response redirected to a URL outside the approved HTTPS hosts' }); return;
              }
              var html = pickText(res), r = Filter.extractPdfLinks(html, page);
              out.push({ page: page, bytes: html.length, pdfCount: r.accepted.length, accepted: r.accepted, rejected: r.rejected.slice(0, 40),
                redirectValidation: responseUrl ? 'final URL checked' : 'final URL not exposed by the Otzaria fetch response; host-level network restrictions must also be enforced' });
            }, function (err) { out.push({ page: page, error: msg(err) }); });
          });
        });
        return chain.then(function () { return out; });
      }
    };
    function runCommand(cmd) {
      if (!cmd || typeof cmd.id !== 'string' || typeof cmd.type !== 'string') return Promise.resolve();
      state.lastCommand = cmd.type; state.handled++; notify();
      deps.log('command', cmd.type, { id: cmd.id });
      var h = handlers[cmd.type], p = h ? h(cmd.params || {}) : Promise.reject(new Error('Unknown command type: ' + cmd.type));
      return p.then(function (result) { return { id: cmd.id, ok: true, result: result }; },
        function (err) { return { id: cmd.id, ok: false, error: msg(err) }; })
        .then(function (body) { return deps.http('POST', '/plugin/result', body); })
        .catch(function (e) { deps.log('error', 'result post failed', { error: msg(e) }); });
    }
    function loop() {
      if (!running) return;
      deps.http('GET', '/plugin/poll?wait=20').then(function (r) {
        if (r.status === 401) { running = false; state.connected = false; state.lastError = 'The companion rejected the token'; notify(); return; }
        if (r.status !== 200) throw new Error('Poll returned HTTP ' + r.status);
        state.connected = true; state.lastError = null; backoff = 1000; notify();
        ((r.json && r.json.commands) || []).forEach(function (c) { runCommand(c); });
        loop();
      }).catch(function (e) {
        state.connected = false; state.lastError = msg(e); notify();
        if (running) setTimeout(loop, backoff);
        backoff = Math.min(backoff * 2, 15000);
      });
    }
    return {
      state: state,
      start: function () {
        if (running) return Promise.resolve();
        running = true;
        return deps.http('POST', '/plugin/hello', { version: deps.version, userAgent: deps.userAgent, transport: deps.transport }).then(function (r) {
          if (r.status === 401) { running = false; state.lastError = 'The companion rejected the token'; notify(); throw new Error(state.lastError); }
          if (r.status !== 200) { running = false; throw new Error('Hello returned HTTP ' + r.status); }
          state.connected = true; notify(); loop();
        }).catch(function (e) { running = false; state.connected = false; state.lastError = msg(e); notify(); throw e; });
      },
      stop: function () { running = false; state.connected = false; notify(); return deps.http('POST', '/plugin/bye', {}).catch(function () {}); }
    };
  }
  var api = { createAgent: createAgent, unwrapHttp: unwrapHttp, pickText: pickText, isValidPort: isValidPort };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BridgeCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
